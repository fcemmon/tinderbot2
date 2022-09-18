import dotenv from 'dotenv'
dotenv.config()
import path from 'path'
import {
  tlog,
  delay,
  createLogDir,
  sendUserTelegramMessage,
  rnd,
  sendTelegramMessage,
  waitUntil,
  delayWithFunction,
  takeErrorScreenshot,
  getDBClient,
} from './utils'
import TinderPage from './tinderPage'

import {
  AccountBannedError,
  AccountLoggedOutError,
  AccountUnderReviewError,
  AgeRestrictedError,
  AlreadyFinishedError,
  CaptchaRequiredError,
  IdentityVerificationRequired,
  OutOfLikesError,
  ProfileVerificationError,
  ProxyError,
  RanOutOfLikesError,
  ShadowBannedError,
  StatusCheckComplete,
} from './errors'
import { Client } from 'pg'

interface Profile {
  gold: any
}

export class SwipeJob {
  jobID: number
  options: any
  swipesSinceLastMatch: number
  shadowBanSwipeCount: number
  executionContextDestroyedCounter: number
  profile!: Profile
  tp!: TinderPage
  client!: Client
  tinderAccountID!: number
  recSwipePercentage!: number
  retries!: number
  accountStatus!: string
  status!: string
  jobType!: string
  swipeDelay!: number
  profileID!: string
  apiToken!: string
  name!: string
  username!: string
  userID!: number
  swipes!: number
  delayVariance!: number
  runID!: number

  constructor(jobID: number, options: any) {
    this.jobID = jobID
    this.options = options
    this.options.verbose = true
    this.swipesSinceLastMatch = 0
    this.shadowBanSwipeCount = 20
    this.executionContextDestroyedCounter = 0
  }

  setTinderPage(tinderPage: TinderPage) {
    this.tp = tinderPage
  }

  async runQuery(query: string, values: any[]) {
    if (this.options.sqlDebug) { tlog(query) }
    return await this.client.query(query, values)
  }

  async Create() {
    let jobID: number
    // try {
    this.client = await getDBClient()

    createLogDir(this.jobID)
    let query = `
        select
          tinder_accounts.id tinder_acc_id,
          retries,
          job_type,
          disable_images,
          tinder_accounts.status as account_status,
          gologin_profile_id,
          gologin_api_token,
          gologin_profile_name,
          delay_variance,
          target - swipes as target,
          recommended_percentage,
          name as username,
          delay as swipe_delay,
          users.id as user_id
        from tinder_accounts
        JOIN swipe_jobs ON swipe_jobs.tinder_account_id = tinder_accounts.id
        JOIN users on users.id = tinder_accounts.user_id
        where swipe_jobs.id = ${this.jobID}`

    let res = await this.runQuery(query, [])

    if (!res.rows[0]) { throw new Error("Job not found") }

    this.tinderAccountID = res.rows[0].tinder_acc_id
    this.recSwipePercentage = res.rows[0].recommended_percentage
    this.retries = res.rows[0].retries
    let disableImages = res.rows[0].disable_images
    this.accountStatus = res.rows[0].account_status
    this.jobType = res.rows[0].job_type
    this.swipeDelay= res.rows[0].swipe_delay
    this.profileID = res.rows[0].gologin_profile_id
    this.apiToken = res.rows[0].gologin_api_token
    this.name = res.rows[0].gologin_profile_name
    this.username = res.rows[0].username
    this.userID = res.rows[0].user_id
    this.swipes = res.rows[0].target

    if (this.jobType == "status_check") { this.swipes = this.shadowBanSwipeCount + 1 }
    this.delayVariance = parseFloat(res.rows[0].delay_variance)

    // TODO test me
    if (this.swipes < 1 && this.jobType != "status_check") {
      throw new AlreadyFinishedError()
    }

    if (this.options.verbose) {
      tlog('START JOB ------------------')
      tlog(
        '\nType:', this.jobType,
        '\nid:', this.jobID,
        '\nprofile:', this.profileID,
        '\nswipes:', this.swipes)
    }

    query = `
      INSERT INTO runs(swipe_job_id, created_at, updated_at)
      VALUES ( $1, timezone('utc', now()), timezone('utc', now()) ) RETURNING id`
    let values = [this.jobID]
    res = await this.runQuery(query, values)
    this.runID = res.rows[0].id
    // tlog("runID:", this.runID)

    query = `
      update swipe_jobs
      set
        started_at=timezone('utc', now()),
        status='running',
        account_job_status_result=NULL,
        retries=retries+1,
        failed_at=null,
        failed_reason=null
      where id = $1`
    await this.runQuery(query, [this.jobID])
    // } catch (e: any) {
    //   await this.handleFailure(e)
    //   throw e
    // }
    return this
  }

  async Run() {
    let exitCode = 0
    try {
      if (this.options.verbose) {
        tlog('\n',
        'type:', this.jobType, '\n',
        'id:', this.jobID, '\n',
        'name:', this.name, '\n',
        'profileID:', this.profileID)
      }

      switch(this.jobType)  {
        case 'likes':
          await this.runLikesJob()
          break
        case 'recommended':
        case 'status_check':
          await this.runRecommendedJob()
          break
        default:
          throw new Error("unknown job type")
      }
      await this.markJobCompleted("finished running job", false)
    } catch (e: any) {
      // if (this.options.verbose) { tlog("SwipeJob: failed", e) }
      exitCode = await this.handleFailure(e)
    } finally {
      return exitCode
    }
  }

  async incrementJobSwipes() {
    this.swipesSinceLastMatch += 1
    await this.runQuery(`
      update swipe_jobs
      set swipes = swipes + 1, swiped_at = timezone('utc', now())
      where id = $1
    `, [this.jobID])
    await this.runQuery(`
      update runs
      set swipes = swipes + 1
      where id = $1
    `, [this.runID])
    // if more than 20 swipes have occured since last match, throw shadowbanned error
    tlog("swipes since last match:", this.swipesSinceLastMatch)

    if (this.swipesSinceLastMatch >= this.shadowBanSwipeCount) {
      tlog(`more than ${this.shadowBanSwipeCount} swipes since last match. account considered shadowbanned`)
      throw new ShadowBannedError()
    }
  }

  async insertMatch() {
    let startIndex = this.profile.gold ? 2 : 1
    let lastMatch = await this.tp.lastMatch(startIndex)
    if (!lastMatch) { return }
    tlog("new match", lastMatch)
    let nameArr = lastMatch[0].split(" ")
    let name = nameArr[nameArr.length-1].replace(/!/, "")
    let useridArr = lastMatch[1].split("/")
    let userid = useridArr[useridArr.length-1]

    let query = `
      INSERT INTO matches (tinder_account_id, tinder_user_id, name, created_at, updated_at)
      VALUES ($1, $2, $3, timezone('utc', now()), timezone('utc', now())) ON CONFLICT DO NOTHING`
    let values = [this.tinderAccountID, userid, name]
    let res = await this.runQuery(query, values)

    if (res.rowCount == 0) {
      tlog("already logged this match before. Skipping...")
      return
    }

    this.swipesSinceLastMatch = 0

    if (this.accountStatus != "active") {
      await this.updateAccountStatus("active")
      this.accountStatus = "active"
    }

    query = `
      UPDATE tinder_accounts
      SET last_matched_at=timezone('utc', now()),
      updated_at=timezone('utc', now())
      WHERE id = $1`
    await this.runQuery(query, [this.tinderAccountID])
    if (this.jobType == "status_check") { throw new StatusCheckComplete() }
  }

  async updateLikeCount(likes: number) {
    tlog("account has", likes, "liked by count")
    const query = `
      UPDATE tinder_accounts
        SET liked_by_count=$1,
        liked_by_count_updated_at=timezone('utc', now()),
        updated_at=timezone('utc', now())
      where id = $2`
    await this.runQuery(query, [likes, this.tinderAccountID])
  }

  async updateAccountStatus(status: string) {
    if (status == "proxy_error") {
      let query = `
        UPDATE tinder_accounts
          SET proxy_active=false,
          updated_at=timezone('utc', now()),
          status_updated_at=timezone('utc', now())
          where id = $1`
      await this.runQuery(query, [this.tinderAccountID])
    } else {
      let query = `
        UPDATE tinder_accounts
          SET status='${status}',
          updated_at=timezone('utc', now()),
          status_updated_at=timezone('utc', now())
          where id = $1`
      await this.runQuery(query, [this.tinderAccountID])

      query = `
        INSERT INTO account_status_updates (retry, before_status, status, tinder_account_id, created_at, updated_at, swipe_job_id)
        VALUES ($1,$2,$3,$4,timezone('utc', now()),timezone('utc', now()),$5)`
      await this.runQuery(query, [this.retries, this.accountStatus, status, this.tinderAccountID, this.jobID])

      // handle account status notification
      if (this.accountStatus != status && status == "captcha_required") {
        try {
          await sendUserTelegramMessage(
            this.userID,
            `captcha https://visadoo.com/tinder_account/${this.tinderAccountID}`
            )
        } catch(e) {
          tlog("error sending user telegram message")
          console.log(e)
        }
      }
    }
  }

  async removeAccountLocation() {
    const query = `
      UPDATE tinder_accounts
        SET location_id=NULL,
        updated_at=timezone('utc', now())
      where id = $1`
    await this.runQuery(query, [this.tinderAccountID])
  }

  async getSwipeDelay() {
    let min = 1.0 - (this.delayVariance / 100)
    let max = 1.0 + (this.delayVariance / 100)
    let x = rnd(this.swipeDelay*min, this.swipeDelay*max)
    return x
  }

  async markJobCancelled() {
    const query = `
      UPDATE swipe_jobs
        SET status='cancelled',
        failed_at=timezone('utc', now())
        where id = $1`
    await this.runQuery(query, [this.jobID])
    const query2 = `
      UPDATE runs
        SET status='cancelled',
        failed_at=timezone('utc', now())
        where id = $1`
    await this.runQuery(query2, [this.runID])
    tlog("marked job cancelled")
  }

  async queryDBStatus() {
    const query = `
      SELECT status
      FROM swipe_jobs
      where id = $1`
    return await this.runQuery(query, [this.jobID])
  }

  async markJobOutOfLikes() {
    const query = `
      UPDATE swipe_jobs
        SET status='ran_out_of_likes',
        failed_at=timezone('utc', now())
        where id = $1`
    await this.runQuery(query, [this.jobID])
    const query2 = `
      UPDATE runs
        SET status='ran_out_of_likes',
        failed_at=timezone('utc', now())
        where id = $1`
    await this.runQuery(query2, [this.runID])
    tlog("marked job", this.jobID, "ran out of likes")
  }

  async markJobFailed(e: Error) {
    let failedReason = e.stack ? e.stack.toString() : ""
    tlog(failedReason)
    const query = `
      UPDATE swipe_jobs
        SET status='failed',
        failed_at=timezone('utc', now())
        where id = $1`
    await this.runQuery(query, [this.jobID])

    const query2 = `
      UPDATE runs
        SET status='failed',
        failed_at=timezone('utc', now()),
        failed_reason=$1
        where id = $2`
    await this.runQuery(query2, [failedReason, this.runID])
    tlog("marked job", this.jobID, "failed")
    this.status = "failed"
  }

  async markJobCompleted(status: string, updateAccount=true) {
    let query
    let query2

    if (updateAccount == null) { updateAccount = true }
    await tlog('\nmarking complete\nstatus: ', status, '\nupdateAccount: ', updateAccount)

    if (updateAccount) {
      await this.updateAccountStatus(status)
      query = `
        update swipe_jobs
        set status='completed',
        completed_at=timezone('utc', now()),
        account_job_status_result='${status}'
        where id = ${this.jobID}`
      query2 = `
        update runs
        set status='completed',
        completed_at=timezone('utc', now()),
        result='${status}'
        where id = ${this.runID}`
    } else {
      query = `
        update swipe_jobs
        set status='completed',
        completed_at=timezone('utc', now()),
        failed_reason='${status}'
        where id = ${this.jobID}`
      query2 = `
        update runs
        set status='completed',
        completed_at=timezone('utc', now()),
        failed_reason='${status}'
        where id = ${this.jobID}`
    }

    await this.runQuery(query, [])
    await this.runQuery(query2, [])

    // TODO test me
    if (this.jobType == "status_check") {
      tlog("mark status check complete")
      await this.markStatusCheckCompleted()
    }

    this.accountStatus = status
    this.status = 'completed'
  }

  async markStatusCheckCompleted() {
    const query = `
      UPDATE tinder_accounts
        SET status_checked_at=timezone('utc', now())
      where id = $1`
    await this.runQuery(query, [this.tinderAccountID])
  }

  // create an object to store all the variables of the job or a class
  async handleFailure(e: Error) {
    e.stack ? e.stack : e.stack = ""
    let exitCode = 0
    let screenshot = true
    tlog("handle job failure")
    if (this.options.debug) { console.log("logerror", e) }
    if (this.options.waitOnFailure) { await delay(600000) }

    if (this == null) {
      tlog('error: no swipe job created')
      return 0
    }

    try {
      if (e.stack.includes("Profile has been deleted")) {
        await this.markJobCompleted("profile_deleted")
      } else if (e.stack.includes("401 INVALID TOKEN OR PROFILE NOT FOUND")) {
        await this.markJobCompleted("profile_deleted")
      } else if (e instanceof AccountLoggedOutError) {
        await this.markJobCompleted("logged_out")
      } else if (e instanceof StatusCheckComplete) {
        await this.markJobCompleted("active")
      } else if (e instanceof ShadowBannedError) {
        await this.markJobCompleted("shadowbanned")
      } else if (e instanceof AlreadyFinishedError) {
        await this.markJobCompleted("finished (no swipes to run)", false)
      } else if (e instanceof AccountBannedError) {
        await this.markJobCompleted("banned")
        await this.removeAccountLocation()
      } else if (e instanceof CaptchaRequiredError ) {
        await this.markJobCompleted("captcha_required")
      } else if (e instanceof AgeRestrictedError) {
        await this.markJobCompleted("age_restricted")
      } else if (e instanceof IdentityVerificationRequired) {
        await this.markJobCompleted("identity_verification")
      } else if (e instanceof AccountUnderReviewError) {
        await this.markJobCompleted("under_review")
      } else if (e instanceof OutOfLikesError) {
        await this.markJobCompleted("out_of_likes")
      } else if (e instanceof RanOutOfLikesError) {
        await this.markJobOutOfLikes()
      } else if (e instanceof ProfileVerificationError) {
        await this.markJobCompleted("verification_required")
      } else {
        let retryStatusCheck = this.jobType == 'status_check' && this.retries < 3
        let retryJob = this.jobType != 'status_check' && this.retries < 3

        if (retryStatusCheck || retryJob) {
          tlog(`Retrying. Retry Count Is ${this.retries}`)
          exitCode = 1
        } else {
          this.notifyError(`Job Failure id: ${this.jobID} type: ${this.jobType} username: ${this.username}`)
        }

        if (e instanceof ProxyError || e.stack.includes("tunneling socket could not be established") || e.stack.includes("net::ERR_FAILED") || e.stack.includes("ERRCONNREFUSED")) {
          await this.markJobCompleted("proxy_error", false)
          return exitCode
        }

        tlog('ERROR: handle unexpected failure')
        console.trace(e)
        await this.markJobFailed(e)
      }

      if (this.tp && this.tp.page) {
        await takeErrorScreenshot(this.tp.page, this.jobID)
      }
    } catch (e)  {
      tlog('error: error in handle error', e)
    } finally {
      tlog('EXITING-------------', exitCode)
      return exitCode
    }
  }

  async notifyError(message: string) {
    await sendTelegramMessage(message)
  }

  // move to tinderlikes
  // params:
  // - number of swipes
  // - swipe callback
  // - delay checker
  async runLikesJob() {
    await this.tp.navigateToLikesPage()

    for (let i=1; i <= this.swipes; i++) {
      if (i % 10 == 0) {
        let likes = await this.tp.queryLikes()
        if (likes) { await this.updateLikeCount(likes) }
      }
      await this.tp.dragAndDrop()
      tlog("liked user, count:", i)
      await this.incrementJobSwipes()
      await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 200)
    }
  }

  // move to tinderrecs
  async runRecommendedJob() {
    await this.tp.navigateToRecsPage()

    let i = 0
    let likeCounter = 0
    let passCounter = 0
    await this.tp.checkAndHandleErrors()
    await delay(20000)
    for await (const x of Array(this.swipes)) {
      i = i + 1
      await this.tp.checkAndHandleErrors()
      const random = Math.random()
      try {
        await this.tp.waitForGamepadLikes()
      } catch(e) {
        await this.tp.checkAndHandleErrors()
      }

      if (random >= (1 - (this.recSwipePercentage / 100))) {
        likeCounter += 1
        await this.tp.clickLike()
      } else {
        passCounter += 1
        await this.tp.clickPass()
      }

      await this.incrementJobSwipes()
      await delayWithFunction(this.insertMatch.bind(this), await this.getSwipeDelay(), 1000)
    }
  }
}
