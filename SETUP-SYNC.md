# Turn on accounts and sync

About ten minutes, all in the Firebase console at <https://console.firebase.google.com>. Free Spark plan, no card needed. Until this is done the app works as before and shows "Accounts are not set up yet".

1. **Create the project.** Click **Create a project**. Name it `python-practice`. Turn **Google Analytics** off. Click **Create project**, then **Continue**.
2. **Register the web app.** On the project overview click the **`</>`** (Web) icon. Nickname `python-practice-web`. Leave **Firebase Hosting** unticked. Click **Register app**. Copy the whole `const firebaseConfig = { ... };` block that appears, then click **Continue to console**.
3. **Turn on sign-in.** Left menu: **Build > Authentication > Get started**. On the **Sign-in method** tab:
   - Click **Email/Password**, switch on the first toggle (**Enable**), click **Save**.
   - Click **Add new provider > Google**, switch on **Enable**, choose your support email, click **Save**.
4. **Create the database.** Left menu: **Build > Firestore Database > Create database**. Location `australia-southeast1 (Sydney)`. Choose **Start in production mode**. Click **Create**.
5. **Paste the rules.** In Firestore open the **Rules** tab. Replace everything with the block below and click **Publish**.

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

6. **Allow the site.** **Authentication > Settings > Authorised domains > Add domain**. Enter `rahulraju3107.github.io` (no `https://`, no path). Click **Add**.
7. **Hand over the config.** Paste the `firebaseConfig` block from step 2 into the chat. It goes into `firebase-config.js`, and nothing else needs editing. This block is safe to be public: it only names the project. The rules in step 5 are what protect the data.

## After that

- Open the site and click **Sign in** at the bottom of the left rail. Create an account with email and password, or use Google.
- The first sign-in on a device that already has progress downloads a backup file first, then merges and shows what was uploaded.
- Each user can only read and write under `users/<their id>/`. For each exercise and note, the most recently changed copy wins.
- Signing out keeps everything saved in the browser. Offline, the app keeps working and syncs when the connection returns.
- If a work network blocks the Google pop-up, use email and password. If it blocks Firebase altogether, use **Export** and **Import** in Settings.
- To turn accounts off again, set `firebase-config.js` back to `export const firebaseConfig = null;`.
