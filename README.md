# Travel Server => AI Agents 

## Overview

This project represents a backend server for a **React Native Expo** application. The server is built using **Node.js** with **Express.js** and is designed to handle AI-powered travel planning and automation.

## Features

- **Firebase Integration**: Used for data storage and caching to enhance app performance.
- **OpenAI API Integration**: Handles AI-based requests for intelligent travel planning.
- **Zod for Schema Validation**: Ensures structured and validated JSON data when interacting with the OpenAI API.
- **Email Notifications**: Uses **Nodemailer** to send automated emails.
- **Google Maps API**: Retrieves real-time location data to generate optimized travel schedules with AI assistance.
- **AI Agents**: Implements specialized AI agents, each focusing on a specific task, executing multiple API calls in parallel using **Promise.all** for efficiency.


## Usage

- The server listens for requests from the **React Native Expo** application.
- It interacts with **Firebase** for storage and caching.
- **OpenAI API** processes user inputs using AI prompts stored in the `prompts/` folder.
- **Google Maps API** retrieves real-time location data to assist AI in generating travel schedules.
- AI agents handle multiple API calls concurrently for faster responses.
- Email notifications are sent automatically via **Nodemailer**.

## AI Agents

To optimize response time, the backend uses **AI agents** that specialize in different tasks. Each agent is responsible for a specific function and operates independently. These agents execute multiple calls simultaneously using the `Promise.all` approach, ensuring high efficiency.


---

