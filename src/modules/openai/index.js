import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
});

const systemMessage = {
  role: "system",
  content:
    "Tanya di PSD-GPT",
};

export const getStreamingCompletion = async ({ userPrompt }) => {
  return client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [systemMessage, { role: "user", content: userPrompt }],
    stream: true,
    temperature: 0.7
  });
};
