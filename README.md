<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1bQJOcAzP7Mxq4f-7SD9XJp2Wlic-n1Wm

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables (optional, defaults are provided):
   - `PANORAMA_HOST` - Panorama server URL (default: https://panorama.officeours.com)
   - `PANORAMA_API_KEY` - Panorama API key
   - `PORT` - Backend server port (default: 3001)

3. Run the full application (frontend + backend):
   ```bash
   npm run dev:full
   ```
   
   Or run separately:
   - Backend server: `npm run server`
   - Frontend: `npm run dev`

## Database

The application uses SQLite for long-term storage of change logs. The database file is stored in the `data/` directory.

### Scheduled Job

A scheduled job runs daily at 01:00 MST to fetch the previous day's change logs from Panorama and save them to the database. This ensures historical data is preserved.

### Data Routing

- **Current day**: Queries Panorama API directly
- **Previous days**: Queries the local database

The frontend automatically routes queries based on the selected date.
