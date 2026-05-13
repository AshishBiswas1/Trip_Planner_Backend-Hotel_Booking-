const axios = require('axios');

// The URL where your Python FastAPI is running
const AI_BASE_URL = 'http://127.0.0.1:5000';

const getFlightPrediction = async (data) => {
  try {
    const response = await axios.post(`${AI_BASE_URL}/predict/flight`, {
      Source: data.source,
      Destination: data.destination,
      Airline: data.airline,
      Month: parseInt(data.month)
    });
    return response.data.estimated_cost;
  } catch (error) {
    console.error('AI Service Error (Flight):', error.message);
    return null; // Fallback value
  }
};

const getHotelPrediction = async (data) => {
  try {
    const response = await axios.post(`${AI_BASE_URL}/predict/hotel`, {
      City: data.city,
      Accomadation_Type: data.type
    });
    return response.data.estimated_daily_rate;
  } catch (error) {
    console.error('AI Service Error (Hotel):', error.message);
    return null;
  }
};

module.exports = { getFlightPrediction, getHotelPrediction };
