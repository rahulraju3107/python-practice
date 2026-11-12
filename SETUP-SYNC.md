# Optional: sync between devices with Firebase

Without this, the app saves to your browser only and works fine. Set this up if you want your progress and notes to follow you between devices automatically. It uses the free Firebase Spark plan. No credit card is needed.

It takes about ten minutes.

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it, for example `python-practice`.
3. Turn **Google Analytics** off. It is not needed. Click **Create project**.

## 2. Register a web app

1. On the project overview page, click the web icon `</>` (**Add app > Web**).
2. Give it a nickname, for example `python-practice-web`. Leave **Firebase Hosting** unticked.
3. Click **Register app**. Firebase shows a block of code containing `const firebaseConfig = { ... }`. Keep this page open. You need those values in step 6.

## 3. Turn on Google sign-in

1. In the left menu open **Build > Authentication** and click **Get started**.
2. On the **Sign-in method** tab, click **Google**, switch it to **Enabled**, pick a support email, and click **Save**.

## 4. Create the Firestore database

1. In the left menu open **Build > Firestore Database** and click **Create database**.
2. Pick a location near you, for example `australia-southeast1` (Sydney).
3. Choose **Start in production mode** and click **Create**.

## 5. Paste the security rules

1. In Firestore, open the **Rules** tab.
2. Replace everything there with the rules below, then click **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Each signed-in user can read and write only their own data.
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Everything the app stores sits under `users/<your user id>/`. These rules block every other path and every other user.

**Optional, stricter:** your site is public, so anyone could sign in with their own Google account and store their own progress in your project. That cannot touch your data, but it uses your free quota. To allow only your account, change the `allow` line to:

```
      allow read, write: if request.auth != null && request.auth.uid == userId
                         && request.auth.token.email == "YOUR-ADDRESS@gmail.com";
```

## 6. Allow your GitHub Pages address

1. Go to **Authentication > Settings > Authorised domains**.
2. Click **Add domain** and enter your GitHub Pages domain **without** `https://` and without the repository name. For example: `rahulraju3107.github.io`.

`localhost` is already on the list, so sign-in also works when you run the site on your own computer.

## 7. Fill in firebase-config.js

Open `firebase-config.js` in the repository. Replace the last line (`export const firebaseConfig = null;`) with the values from step 2:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

Commit and push the change (or edit the file on github.com and click **Commit changes**). Wait a minute for GitHub Pages to update.

It is normal and safe for this config to be public. It only identifies the project. The security rules from step 5 are what protect the data.

## 8. Sign in

1. Open the site and go to **Settings**.
2. Under **Sync**, click **Sign in with Google**. If nothing happens, allow pop-ups for the site and try again.
3. The status in the corner changes to **Synced**. Do the same on your other devices.

## How sync behaves

- The app always saves to the browser first. Sync copies changes to Firebase in the background.
- With no connection the status shows **Offline** and you can keep working. It syncs when the connection returns.
- If the same exercise or note was changed on two devices, the most recently changed copy wins. This is decided per exercise and per note, so other records are not affected.
- Unsubmitted code in the editor (drafts) stays on the device and is not synced.
- A locked-down work network may block Firebase. The app then stays in **Offline** or **Sync error** and keeps working locally. Use **Export** and **Import** in Settings to move progress by hand.

## Turning sync off

Set `firebase-config.js` back to `export const firebaseConfig = null;`. Your local progress stays where it is.
