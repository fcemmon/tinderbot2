// controls the browser, tinder page, takes actions on the page
import playwright, { Page, Browser } from "playwright";
import fs from "fs";
import GoLogin from "gologin";
import path from "path";
import { tlog, terr, delay, saveJson, waitUntil } from "./utils";

import {
  AccountBannedError,
  AccountLoggedOutError,
  AccountUnderReviewError,
  AgeRestrictedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  ProfileVerificationError,
  RanOutOfLikesError,
} from "./errors";
import { SwipeJob } from "./swipeJob";

const DEFAULT_TIMEOUT = 90000;

export default interface TinderPage {
  page: Page;
  job: SwipeJob;
  GL: GoLogin;
  browser: Browser;
  savedProfile: any;
}

export default class TinderPage {
  options: any;
  lastMatchHref: any;
  desiredURL!: string;
  constructor(job: SwipeJob, options: { profileID: string; apiToken: string }) {
    this.job = job;
    this.options = options;
  }

  async start() {
    let browserOptions = [];
    if (this.options.disableImages) {
      browserOptions.push("--blink-settings=imagesEnabled=false");
    }

    this.GL = new GoLogin({
      autoUpdateBrowser: false,
      token: this.options.apiToken,
      profile_id: this.options.profileID,
      extra_params: browserOptions,
    });
    const { status, wsUrl } = await this.GL.start();

    // tlog('starting browser', wsUrl.toString())
    this.browser = await playwright.chromium.connectOverCDP(wsUrl.toString());

    let contexts = this.browser.contexts();
    let context = contexts[0];
    await context.route("**/*", (route) => {
      let url = route.request().url();
      let isAd =
        url.startsWith("https://googleads.") ||
        url.startsWith("https://ad.doubleclick.net") ||
        url.startsWith("https://www.googletagmanager.com") ||
        url.startsWith("https://www.google-analytics.com/collect");
      return isAd ? route.abort() : route.continue();
      // return (isAd || route.request().resourceType() === 'image') ? route.abort() : route.continue()
    });
    this.page = await context.newPage();
    this.page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);
    this.page.setDefaultTimeout(DEFAULT_TIMEOUT);

    this.page.on("response", async (response) => {
      if (response.url().startsWith("https://api.gotinder.com/v2/profile?")) {
        if (!this.savedProfile) {
          let parsed = await saveJson(this.job.jobID, (await response.body()).toString());
          if (parsed) {
            this.job.profile = parsed;
          }
          this.savedProfile = true;
        }
      }
    });

    let pages = await context.pages();
    pages.forEach(async (page) => {
      let url = await page.url();
      if (url.includes("tinder.com")) {
        tlog("closing tinder.com page");
        page.close();
      }
    });
  }

  async stop() {
    if (this.browser) {
      try {
        tlog("found browser, closing");
        await this.browser.close();
        tlog("done closing browser");
      } catch (e) {
        tlog("failed closing browser ");
      } finally {
        tlog("after closing browser ");
      }
    }

    try {
      tlog("stopping GL");
      await this.GL.stop();
      tlog("done stopping GL");
    } catch (e) {
      tlog("failed GL stop");
    } finally {
      tlog("after GL stop");
    }
  }

  async lastMatch(startIndex: number) {
    let match = await this.page.evaluate((startIndex) => {
      let lMatch = document.querySelector('a.matchListItem[href^="/app/messages"]') as HTMLAnchorElement | null;
      if (!lMatch) {
        return;
      }
      let lastHref = lMatch.href;
      lastHref = lastHref.replace("file://", "");
      lastHref = lastHref.replace("https://tinder.com", "");
      let selector = `a.matchListItem[href="${lastHref}"] span div div`;
      // console.log("looking for selector", selector)
      let node = document.querySelector(selector) as HTMLElement | null;
      let nameByHref;
      if (node) {
        nameByHref = node.innerText;
        // console.log("last match", nameByHref, lastHref)
        return [nameByHref, lastHref];
      }
    }, startIndex);

    if (match != null && this.lastMatchHref != match[1]) {
      this.lastMatchHref = match[1];
      return match;
    } else {
      // tlog("TP: no match found")
      return;
    }
  }

  getURL() {
    return this.page.url();
  }

  // checks
  async checkAndHandleErrors() {
    if (this.options.debug) {
      tlog("check and handle errors called");
    }
    const url = this.getURL();
    tlog("checkAndHandleErrors: URL", url);
    if (url.includes("app/banned")) {
      throw new AccountBannedError();
    }
    if (url.includes("verify/identity")) {
      throw new IdentityVerificationRequired();
    }
    if (url.includes("verify/challenge")) {
      throw new CaptchaRequiredError();
    }

    await this.checkCaptchaRequired();

    if (await this.checkActiveTabError()) {
      await tlog("handling active tab error");
      await this.handleActiveTabError();

      tlog("redo check and handle errors");
      await this.checkAndHandleErrors();

      return true;
    }
    if (await this.checkAgeRestricted()) {
      throw new AgeRestrictedError();
    }
    if (url == "https://tinder.com/") {
      throw new AccountLoggedOutError();
    }
    await this.handleErrorPopup(); // move to check and handle errors
    await this.checkAccountUnderReview();
    if (url.includes("app/matches")) {
      throw new OutOfLikesError();
    }
    console.log("CHECK UNDER REVIEW HERE");
    await this.checkProfileUnderReview();
    console.log("DONE: CHECK UNDER REVIEW HERE");

    if (!url.startsWith(this.desiredURL)) {
      tlog(`navigated away from desired page to: ${this.desiredURL} -- redirecting.`);
      await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
      return;
    }

    if (await this.checkOutOfLikes()) {
      throw new OutOfLikesError();
    }
  }

  async checkOutOfLikes() {
    let likesPageOutOfLikes = await this.page.evaluate(() => {
      let likesPage = document.querySelector('[data-testid="likesYouScroller"]');
      if (likesPage) {
        return likesPage.innerHTML.includes("your chances");
      }
    });
    return likesPageOutOfLikes;
  }

  async checkProfileUnderReview() {
    const isUnderReview = await this.page.evaluate(async () => {
      let h3s = document.querySelectorAll<HTMLElement>("h3") as NodeList;
      console.log("check under review", h3s.length);
      let any = false;
      if (h3s != null) {
        h3s.forEach((e) => {
          console.log((e as HTMLElement).innerText);
          if ((e as HTMLElement).innerText.toLowerCase() == "your account is under review") {
            any = true;
          }
        });
      }
      return any;
    });
    console.log("under review?", isUnderReview);
    if (isUnderReview) {
      throw new AccountUnderReviewError();
    }
  }

  async checkAccountUnderReview() {
    const element = await this.page.$('div[data-testid="dialog"] div[data-testid="subtitle-0"] span');
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (
        text ==
        "You’ve been reported by users too many times. We will be reviewing your account to determine what actions need to be made."
      ) {
        throw new AccountUnderReviewError();
      }
    }
  }

  async checkActiveTabError() {
    const element = await this.page.$("h3");
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (text) {
        return text.toLowerCase().includes("opened the app in a new tab");
      }
    }
  }

  async checkAgeRestricted() {
    const element = await this.page.$("h3");
    if (element !== null) {
      const text = await this.page.evaluate((element) => element.textContent, element);
      if (text) {
        return text.toLowerCase().includes("age restricted");
      }
    }
  }

  async checkCaptchaRequired() {
    return await this.page.evaluate(() => {
      let el = document.querySelector("p#home_children_body") as HTMLElement | null;
      if (el != null && el.innerText == " Please solve this puzzle so we know you are a real person") {
        throw new CaptchaRequiredError();
      }
    });
  }

  // TODO rec specific
  async navigateToRecsPage(retries: number = 0) {
    // await this.page.setViewport({ width: 1366, height: 900});
    this.desiredURL = "https://tinder.com/app/recs";
    await this.page.goto(this.desiredURL, { waitUntil: "networkidle" }); // timeout: DEFAULT_TIMEOUT * 2 + 102 })
    await delay(5000);
    await this.checkAndHandleErrors();
    try {
      await this.page.waitForSelector("div.recsCardboard__cards");
    } catch (e) {
      terr("error: navigate to recs page");
      if (retries < 2) {
        tlog("navigation retries", retries);
        await this.checkAndHandleErrors();
        await this.navigateToRecsPage(retries + 1);
      }
    } finally {
      await this.checkAndHandleErrors();
    }

    await waitUntil(() => this.job.profile);
  }

  // likes specific
  async queryLikes() {
    let likes = await this.page.evaluate(() => {
      let el = document.querySelector("nav[aria-label='Likes You Navigation Bar'] span") as HTMLElement | null;
      if (el != null) {
        return parseInt(el.innerText.replace(/[^.\d]/g, ""));
      } else {
        return null;
      }
    });

    if (likes != null && !isNaN(likes) && likes <= 1) {
      tlog("ran out of likes");
      throw new RanOutOfLikesError();
    } else {
      tlog("could not read liked by count");
    }
    return likes;
  }

  // likes specific
  async navigateToLikesPage() {
    tlog("navigating to likes-you");
    this.desiredURL = "https://tinder.com/app/likes-you";

    // await this.page.setViewport({ width: 1366, height: 900})
    await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });

    tlog("DONE - navigating to likes-you");

    await delay(10000);

    const retry = await this.checkAndHandleErrors();

    if (retry) {
      await this.checkAndHandleErrors();
      await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
    }

    await delay(5000);

    let currentUrl = this.getURL();
    if (!currentUrl.includes("tinder.com/app/likes-you")) {
      tlog(`tinder.com navigated away from desired page to: ${currentUrl} -- redirecting.`);
      await tlog("navigating to likes-you");
      await this.page.goto(this.desiredURL, { waitUntil: "networkidle" });
      tlog("DONE - navigating to likes-you");
    }

    await this.checkAndHandleErrors();
    await this.page.waitForSelector('a[href="/app/matches"]', { timeout: DEFAULT_TIMEOUT + 123 });
    await this.checkAndHandleErrors();
    await tlog("PAGE FINISHED LOADING");
    await delay(10000);
    await this.checkAndHandleErrors();
    await delay(5000);
    await waitUntil(() => this.job.profile);
  }

  // recommended specific
  async waitForGamepadLikes() {
    try {
      tlog("wait for likes button");
      await this.page.waitForFunction(
        () => {
          let hiddenSpans = document.querySelectorAll("span.Hidden");
          let p0 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "LIKE")[0];
          let p1;
          let p2;
          let p3;

          if (p0 != null) {
            p1 = p0.parentElement;
            if (p1 != null) {
              p2 = p1.parentElement;
              if (p2 != null) {
                p3 = p2.parentElement;
                if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
                  return true;
                }
              }
            }
          }

          return false;
        },
        { timeout: DEFAULT_TIMEOUT * 3 }
      );
    } catch (e) {
      await this.checkAndHandleErrors();

      tlog("catch error waitForFunction likeButton");
      // if the button exists and is disabled throw appropriate error
      let gamepadDisabled = await this.page.evaluate(() => {
        let el = document.querySelectorAll(".recsCardboard__cardsContainer button")[13];
        let disabled;
        if (el) {
          disabled = el.getAttribute("aria-disabled");
        }
        return [!!el, disabled];
      });

      let outOfMatches = await this.page.evaluate(() => {
        let globalEl = document.querySelector('[aria-busy="true"] ~div div') as HTMLElement | null;
        let globalError;
        let runOutPotential;

        if (globalEl) {
          globalError = globalEl.innerText.includes("Go global and see people around the world.");
          runOutPotential = globalEl.innerText.includes("out of potential matches");
        }

        let unableToFindMatches = document.querySelector('[aria-busy="true"] ~div') as HTMLElement | null;
        let unableToMatchError;
        if (unableToFindMatches) {
          unableToMatchError = unableToFindMatches.innerText.includes("find any potential matches");
        }

        let allHtml = document.querySelector(".recsCardboard__cards");
        let allHtmlErr;
        if (allHtml) {
          allHtmlErr =
            allHtml.innerHTML.includes("run out of potential matches") ||
            allHtml.innerHTML.includes("unable to find any potential matches") ||
            allHtml.innerHTML.includes("Go global and see people around the world");
        }

        return globalError || runOutPotential || unableToMatchError || allHtmlErr;
      });

      if (gamepadDisabled[1]) {
        tlog("throw specific error here");
        throw new OutOfLikesError();
      } else if (outOfMatches) {
        tlog("error: Go global and see people around the world.");
        throw new OutOfLikesError();
      } else {
        tlog("throw unhandled timeout error");
        throw e;
      }
    }
  }

  async clickPass() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "NOPE")[0].parentElement;
      let p2;
      let p3;
      if (p1 != null) {
        p2 = p1.parentElement;
        if (p2 != null) {
          p3 = p2.parentElement;
          if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
            if (p3 != null) {
              p3.click();
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  async clickLike() {
    await this.page.waitForFunction(() => {
      let hiddenSpans = document.querySelectorAll("span.Hidden");
      let p1 = [...hiddenSpans].filter((x) => (x as HTMLElement).innerText == "LIKE")[0].parentElement;
      let p2;
      let p3;
      if (p1 != null) {
        p2 = p1.parentElement;
        if (p2 != null) {
          p3 = p2.parentElement;
          if (p3 != null && p3.getAttribute("aria-disabled") != "true") {
            if (p3 != null) {
              p3.click();
              return true;
            }
          }
        }
      }
      return false;
    });
  }

  // actions
  async handleErrorPopup() {
    const selector = '[data-testid="onboarding__errorTitle"]';
    if ((await this.page.$(selector)) !== null) {
      tlog("detected errorTitle - pressing escape");
      await this.page.keyboard.press("Escape");
    }
  }

  async handleActiveTabError() {
    await this.page.evaluate(() => {
      let el = document.querySelector('button[data-testid="reload"]') as HTMLElement | null;
      if (el != null) {
        el.click();
      }
    });
    await delay(10000);
    // await this.page.waitForNavigation()
  }

  async dragAndDrop() {
    await this.checkAndHandleErrors();
    const likesYouCard = await this.page.$('[data-testid="likesYouCard"] div');
    let boundingBox;

    // TODO handle null case
    if (likesYouCard) {
      boundingBox = await likesYouCard.boundingBox();
      if (boundingBox) {
        await this.page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(1000, 19);
        await this.page.mouse.up();
      }
    }

    // wait for card to stop moving
    await this.page.waitForFunction(
      () => {
        let el = document.querySelectorAll('[data-testid="likesYouCard"]')[0] as HTMLElement | null;
        if (el) {
          return el.style.transform == "translate3d(0px, 0px, 0px) rotate(0deg) scale(1, 1)";
        }
      },
      { timeout: DEFAULT_TIMEOUT }
    );
  }
}
