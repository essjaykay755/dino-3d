import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp, collection, query, orderBy, limit as firestoreLimit, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const USERNAME_KEY = "dinoUsername";

/**
 * Checks if a username has already been registered locally.
 * @returns {string|null} The saved username or null
 */
export function getSavedUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

/**
 * Saves the username locally.
 * @param {string} username 
 */
export function saveUsernameLocally(username) {
  localStorage.setItem(USERNAME_KEY, username);
}

/**
 * Saves a high score directly to Firestore with geolocation.
 * @param {string} username 
 * @param {number} score 
 * @returns {Promise<boolean>} Whether the save succeeded
 */
export async function saveHighScoreToFirebase(username, score) {
  try {
    let location = "Unknown";
    try {
      const geoRes = await fetch("https://get.geojs.io/v1/ip/geo.json");
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.city && geoData.country) {
          location = `${geoData.city}, ${geoData.country}`;
        } else if (geoData.country) {
          location = geoData.country;
        }
      }
    } catch (e) {
      console.warn("Could not fetch geolocation", e);
    }

    const docRef = doc(db, "leaderboard", username);
    await setDoc(docRef, {
      username: username,
      score: Math.floor(score),
      location: location,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("Error saving high score to Firebase:", error);
    return false;
  }
}

/**
 * Retrieves the top high scores from Firestore.
 * @param {number} limitNum The maximum number of scores to retrieve (0 for all)
 * @returns {Promise<Array>} Array of score objects
 */
export async function getTopScores(limitNum = 10) {
  try {
    const leaderboardRef = collection(db, "leaderboard");
    let q;
    if (limitNum > 0) {
      q = query(leaderboardRef, orderBy("score", "desc"), firestoreLimit(limitNum));
    } else {
      q = query(leaderboardRef, orderBy("score", "desc"));
    }
    
    const querySnapshot = await getDocs(q);
    const scores = [];
    querySnapshot.forEach((doc) => {
      scores.push(doc.data());
    });
    return scores;
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return [];
  }
}
