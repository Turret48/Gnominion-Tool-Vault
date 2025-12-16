const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors")({origin: true});
const { defineString } = require("firebase-functions/params");

// Initialize Firebase Admin SDK
admin.initializeApp();

const geminiApiKey = defineString("GEMINI_API_KEY");

// Initialize the Gemini AI model with the API key
const genAI = new GoogleGenerativeAI(geminiApiKey.value());

exports.getExplanation = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const { tool } = req.body;

    if (!tool) {
      return res.status(400).send('The function must be called with a "tool" argument.');
    }

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const prompt = `Explain the command-line tool "${tool}" in a helpful and concise way for a developer. Focus on its main purpose and provide a common use case example.`
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      res.status(200).send({ explanation: text });
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      res.status(500).send('Failed to call the Gemini API.');
    }
  });
});
