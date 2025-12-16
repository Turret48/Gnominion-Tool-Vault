const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Firebase Admin SDK
admin.initializeApp();

// It is recommended to set your API key as an environment variable in the Firebase console
const genAI = new GoogleGenerativeAI(functions.config().gemini.key);

exports.enrichToolWithGemini = functions.https.onCall(async (data, context) => {
  // You can optionally add authentication checks here
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'This function must be called while authenticated.');
  // }
  
  const { prompt } = data;

  if (!prompt) {
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "prompt" argument.');
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return { data: text };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new functions.https.HttpsError('internal', 'Failed to call the Gemini API.');
  }
});
