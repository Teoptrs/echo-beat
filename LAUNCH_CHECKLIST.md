# Launch checklist (the steps that need Teo)

The game, ads, purchases, icons, store art and build pipeline are done. These are the steps that need your accounts, money or identity. Do them roughly in this order.

## 0. Put the code on GitHub

- [ ] Create an **empty** repository called `echo-beat` under your GitHub account (no README, no licence), then tell Claude so it can push the code.
- [ ] The first push runs the Android build in GitHub Actions. Download `echo-beat-debug-apk` from the run to try the game on your phone.

## 1. Accounts (one-time)

- [ ] **Google Play developer account**: https://play.google.com/console/signup. One-time $25 fee plus ID verification, which can take a few days.
  - ⚠️ New personal accounts must run a **closed test with at least 12 testers for 14 days in a row** before they can publish to production. Line up 12+ friends with Android phones early.
- [ ] **Payments profile** (Play Console → Settings → Payments profile). Required to sell in-app purchases. Google takes 15% of your first $1M per year.
- [ ] **AdMob account**: https://admob.google.com, signed in with the same Google account. Add your bank/tax details under Payments (payouts start once you pass €70 / $100).

## 2. AdMob setup

- [ ] AdMob → Apps → Add app → Android → "not published yet" → name **Echo Beat**. Copy the **App ID** (`ca-app-pub-…~…`).
- [ ] Create two ad units in that app: **Rewarded** and **Interstitial**. Copy both **ad unit IDs** (`ca-app-pub-…/…`).
- [ ] AdMob → Privacy & messaging → **GDPR** → create a message for Echo Beat and publish it. The game already shows it to EU players; without it ads are limited in the EU.
- [ ] Later, once the app is live: link the app to its Play Store listing in AdMob, and set up `app-ads.txt` if you have a website.

⚠️ Never tap your own real ads. Debug builds use Google's test ads, which are safe; release builds use your real IDs, so to test on your own phone add it as a test device in AdMob → Settings → Test devices.

## 3. Signing key

Generate an upload key once and keep it **backed up somewhere safe** (password manager + offline copy). Losing it means asking Google to reset it.

```bash
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.jks > upload.jks.b64   # on macOS: base64 -i upload.jks -o upload.jks.b64
```

Play App Signing (enabled by default) keeps the real app-signing key at Google; yours is only the upload key.

## 4. GitHub secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `upload.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | key password |
| `ADMOB_APP_ID` | AdMob app id (`…~…`) |
| `ADMOB_REWARDED_ID` | rewarded ad unit id |
| `ADMOB_INTERSTITIAL_ID` | interstitial ad unit id |

And under **Variables**: `PRIVACY_POLICY_URL` = wherever you host the privacy policy (step 5).

After that, every push to `main` builds a signed release bundle: Actions → latest run → Artifacts → `echo-beat-release-aab`.

## 5. Privacy policy

Play requires a public privacy policy URL because the game shows ads.

- [ ] Replace `CONTACT_EMAIL` in `docs/privacy-policy.html` with an email you're happy to make public.
- [ ] Host it. Easiest: GitHub Pages from the `docs/` folder (repo Settings → Pages → Deploy from branch → `main` / `docs`). Pages on a **private** repo needs GitHub Pro (free with the Student Developer Pack); otherwise make the repo public or host the page anywhere else.

## 6. Play Console: create the app

- [ ] Create app → name "Echo Beat: Rhythm Puzzle", Game, Free.
- [ ] Fill **App content**: privacy policy URL, ads = yes, content rating questionnaire, target audience 13+, data safety (answers in `store-listing/listing.md`).
- [ ] **Store listing**: text from `store-listing/listing.md`, icon, feature graphic and screenshots from `store-listing/`.
- [ ] **Testing → Closed testing**: upload the `.aab` from GitHub Actions, add your 12+ testers by email, roll out. Start the 14-day clock.

## 7. In-app products

These can only be created after a build with billing has been uploaded (step 6).

- [ ] Monetize → Products → **In-app products**, create exactly these ids:

| Product id | Name | Price |
| --- | --- | --- |
| `remove_ads` | Remove Ads | €2.99 |
| `premium_inks` | Premium Inks | €1.99 |
| `coins_500` | 500 Coins | €0.99 |
| `coins_2000` | 2,000 Coins | €2.99 |

- [ ] Settings → **License testing**: add your Gmail so your own test purchases are free.

## 8. Go live

- [ ] After 14 days of closed testing, apply for production access (Play asks a few questions about the test).
- [ ] Promote the release to Production.
- [ ] Post short gameplay clips (TikTok, YouTube Shorts, Reels). That's the main way small games get found.

## Trying the game right now

- **On your phone:** download `echo-beat-debug-apk` from the latest GitHub Actions run, copy it to your Android phone and open it (allow "install unknown apps"). It uses test ads, and purchases won't work until the products exist in Play.
- **In Claude:** the playable demo at https://claude.ai/artifact/Tq2uwc6oigEGydd9g3Ybnq runs the same build. Ads and purchases are simulated, and progress is saved in that browser.
- **In a browser:** `npm install && npm run dev`, then open the printed URL. Ads and purchases are simulated.
