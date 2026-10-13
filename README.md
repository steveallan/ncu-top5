# NCU Top 5

Every Tuesday at 12pm (Sydney), October to March, this repo:

1. reads the past week's NCU scorecards from PlayHQ,
2. makes four Facebook cards (Top 5 batting, bowling, partnerships, fielding) and a draft caption,
3. commits them under `rounds/<season>/<round>/` and opens a **Top 5** issue showing them.

Check the issue, edit the caption in it if you like, then add the **approved** label. The cards
are posted to the NCU Facebook Page as one album, and the link is added to the issue, which then closes.

## Running it by hand

- **Actions → Gather Top 5 → Run workflow** remakes this week's cards. You can also give a date to
  remake an earlier round. If that round's issue is still open, it's refreshed rather than duplicated.
- **Actions → Post Top 5 to Facebook → Run workflow** only checks the Facebook token and posts nothing.
- Locally: `npm install`, `npx playwright install chromium`, then `TOP5_TODAY=2026-10-13 node scripts/gather.mjs`.

## How the lists are decided

- **Batting:** runs. A not-out ranks above an out on the same score. Ties are ordered by fewer balls where PlayHQ has them.
- **Bowling:** wickets, then fewer runs, then fewer overs.
- **Partnerships:** rebuilt from the fall of wickets, including any partnership still unbroken at the end of the innings. PlayHQ doesn't split
  a partnership between the two batters, so each batter's whole innings is shown by their name. If a scorecard's fall of
  wickets doesn't fit its batting order (a retirement, a scorer's mistake), the issue lists that innings to check.
- **Fielding:** catches, stumpings and run outs together. Keepers are marked WK.
- Players level on the same figures share a rank ("=1"). If exactly one extra player is level with fifth, the card shows six rows. If more
  than one is, the card shows five and says how many others are level.
- Players whose PlayHQ profile is private show as "Private player". The issue flags them.

## One-off setup

### 1. GitHub

1. Create a **private** repository named `ncu-top5` at <https://github.com/new>. Don't add a README.
2. Push this folder to it, following the `git remote add` / `git push` lines GitHub shows you.
3. Leave GitHub's email notifications on (Settings → Notifications). That way, each Tuesday's issue arrives by email.

### 2. Meta app and Page token

You need to be an admin of the NCU Page, with full control, on your own Facebook account.

1. Go to <https://developers.facebook.com>, choose **Get started**, and register as a developer.
   You'll need to verify your phone number.
2. **My Apps → Create app.** Name it `NCU Top 5`. For the use case, pick **Manage everything on your Page**.
   If you're asked about a business portfolio, choose not to connect one.
3. In the app, open **Use cases → Manage everything on your Page → Customize** and add these
   permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. If the NCU Page is
   managed through Meta Business Suite, add `business_management` too.
4. **App settings → Basic:** add a Privacy Policy URL (the NCU website's privacy page will do), an app icon
   (the NCU logo) and the category *Business and Pages*. Save, then switch the app from
   **Development** to **Live** at the top of the dashboard.
   *This matters: posts from an app still in Development mode can be visible only to you.*
   Because you're the app's own admin, you don't need to submit it to Meta for App Review.
5. Open the **Graph API Explorer** (<https://developers.facebook.com/tools/explorer>). Choose the
   `NCU Top 5` app, then **Get User Access Token**. Tick the permissions from step 3 and click **Generate**. In the
   Facebook window that opens, choose the **NCU Page** when it asks which Pages to allow.
6. Make that token long-lived. Click the **ⓘ** beside the token, then **Open in Access Token Tool**,
   then **Extend Access Token**. Copy the new token it shows.
7. Back in the Explorer, paste the extended token into the token box and run this query:
   `me/accounts?fields=id,name,access_token`. Find the NCU Page in the results and copy its
   **`id`** and its **`access_token`**. A Page token made from an extended token **doesn't expire**.
8. Check it: paste the Page token into the **Access Token Debugger**
   (<https://developers.facebook.com/tools/debug/accesstoken>). It should say *Type: Page* and
   *Expires: Never*.

### 3. Give GitHub the token

In the repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

- `FB_PAGE_ID`: the Page `id` from step 7
- `FB_PAGE_TOKEN`: the Page `access_token` from step 7

Then run **Actions → Post Top 5 to Facebook → Run workflow**. It should report that the token works
for the NCU Page, never expires, and has `pages_manage_posts`.

For the first real post, open it in a private browser window while logged out. That confirms the public can see it.

### When the token stops working

The Page token stays valid until you change your Facebook password, stop being a Page admin, or
remove the app. If any of those happens, posting fails and the issue says so. Redo steps 5–8 and update
`FB_PAGE_TOKEN`.

## Leaving someone off the cards

If a player asks not to be included (the privacy policy, `PRIVACY.md`, promises this), add their name to
`excluded.json` exactly as PlayHQ shows it, e.g. `{ "names": ["Jane Citizen"] }`. From then on they show as
"Private player". To take them out of a post that's already up, edit or delete that post on Facebook.
