//import modules: express, dotenv
const express = require("express");
const dotenv = require("dotenv");
const app = express();
const axios = require("axios");

//accept json data in requests
app.use(express.json());

//setup environment variables
dotenv.config();

//OpenAIApi Configuration
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
//build openai instance using OpenAIApi
const openai = new OpenAIApi(configuration);

//build the runCompletion which sends a request to the OPENAI Completion API
//runCompletion
async function runCompletion(prompt) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    // model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    functions: [
      {
        name: "get_current_weather",
        description: "Get the current weather in a given location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state, e.g. San Francisco, CA",
            },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
            },
          },
          required: ["location"],
        },
      },
    ],
    temperature: 1,
    max_tokens: 50,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });
  return response;
}

// get weather
async function getWeather(parsed_function_arguments) {
  try {
    const response = await axios.get(
      "http://api.weatherapi.com/v1/current.json",
      {
        params: {
          q: parsed_function_arguments.location,
          key: process.env.WEATHER_API_KEY,
        },
      }
    );

    const weather = response.data;

    const { condition, temp_c, temp_f } = weather.current;
    const unit =
      parsed_function_arguments.unit !== "fahrenheit"
        ? "celcius"
        : "fahrenheit";
    const temperature = unit === "celcius" ? temp_c : temp_f;
    return { temperature, unit, description: condition.text };
  } catch (error) {
    console.error(error);
  }
}

//post request to /api/chatgpt
app.post("/api/chatgpt", async (req, res) => {
  try {
    //extract the text from the request body
    const { text } = req.body;

    // request 1
    // Pass the request text to the runCompletion function
    const completion = await runCompletion(text);

    // get called_function
    const called_funtion = completion.data.choices[0].message.function_call;

    //check if we have a function calling
    if (!called_funtion) {
      // Return the completion as a JSON response
      res.json({ data: completion.data });
      return;
    }

    // get function name and arguments
    const { name: function_name, arguments: function_arguments } =
      called_funtion;
    const parsed_function_arguments = JSON.parse(function_arguments);

    if (function_name === "get_current_weather") {
      // request 2
      // Get weather
      // temperature, unit and description
      const wetherObject = await getWeather(parsed_function_arguments);

      res.json({
        request1: { data: completion.data },
        request2: wetherObject,
      });
      return;
    }

    // requesst 3
  } catch (error) {
    //handle the error in the catch statement
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error("Error with OPENAI API request:", error.message);
      res.status(500).json({
        error: {
          message: "An error occured during your request.",
        },
      });
    }
  }
});

//set the PORT
const PORT = process.env.PORT || 5000;
//start the server on the chosen PORT
app.listen(PORT, console.log(`Server started on port ${PORT}`));
