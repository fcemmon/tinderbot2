1. existing framework (puppeteer) w/ library called ghost-cursor to randomize mouse movements

- need to add scrolling and dragging since it's not included
- requires a lot of manually defined steps
- requires integration with our current solution (not a replacement)

2. record/replay mouse/pointer events in browser

- record period of time as a real user, save all the mouse events, then replay these events on a loop
- implicitly takes care of the scrolling, movement, clicking, dragging

3. control the mouse outside the browser

- pro: can eventually become very powerful w/ ability to detect what it's doing, e.g. detect popups, know what it's clicking.
- getting into AI territory.
- con: little-to-no context as to what it's doing, no feedback
- con: Not something easy ot implement unless I can find a library that already does the heavy lifting.

4. a hybrid of in-browser and outside of browser solutions

- could be a very powerful combination
- the browser can provide cues on buttons/profile cards/popups and a tool running outside the browser can manage the mouse movement, scrolling, clicking...
- browser could provide details on the coordinates of the cards, popups, etc
- another program outside the browser could read these coordinates and decide what/when/how to click
- not clear how beneficial it is to not do everything in the browser.
- It's theorectically possible to be totally human-like all from within the browser. It's *absolutely* possible to be totally human-like if we are controlling the mouse outside the browser.
