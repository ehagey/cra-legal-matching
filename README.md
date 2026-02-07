# Legal Clause Analyzer

Automated developer agreement clause comparison tool for Charles River Associates (CRA). Compares Apple Developer Agreement clauses against competitor platform agreements using AI-powered analysis.

## Features

- **AI-Powered Analysis**: Uses Claude Sonnet 4.5 via OpenRouter to find and compare legal clauses
- **Precise Citations**: Identifies exact page, section, and paragraph numbers for all matches
- **Classification System**: Categorizes matches as IDENTICAL, SIMILAR, or NOT_PRESENT
- **Side-by-Side Differences**: Highlights key differences for SIMILAR matches
- **Overview Matrix**: Quick visual summary of all comparisons
- **Filtering & Export**: Filter results and export to JSON
- **Cost Tracking**: Monitor token usage and estimated costs

## Setup

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure API Key**
   - Copy `.env.example` to `.env`
   - Add your OpenRouter API key:
     ```
     OPENROUTER_API_KEY=your_api_key_here
     ```
   - Get your API key from [OpenRouter](https://openrouter.ai)

3. **Run the Application**
   ```bash
   streamlit run app.py
   ```

## Usage

1. **Enter Apple Clauses**: Use the sidebar to input 1-10 Apple Developer Agreement clauses (default: 6)

2. **Upload PDFs**: Upload one or more competitor agreement PDFs (max 50MB each)

3. **Analyze**: Click the "Analyze" button to process all comparisons

4. **Review Results**: 
   - View the overview matrix for quick scanning
   - Use tabs to see detailed results per clause
   - Filter by classification or agreement
   - Export results as JSON
   - Copy citations for report writing

## Project Structure

```
clause-analyzer/
├── app.py                          # Main Streamlit application
├── config.py                       # Configuration and environment variables
├── requirements.txt                # Python dependencies
├── services/
│   ├── openrouter_service.py      # OpenRouter API integration
│   └── pdf_service.py             # PDF encoding and validation
├── utils/
│   ├── formatting.py              # Streamlit display components
│   └── validation.py             # Input validation functions
└── constants/
    └── prompts.py                 # LLM prompt templates
```

## Technical Details

- **Model**: `anthropic/claude-sonnet-4.5`
- **PDF Engine**: `pdf-text` (free text extraction via OpenRouter)
- **Temperature**: 0 (deterministic for legal work)
- **Max Tokens**: 4000 per comparison
- **Rate Limiting**: 0.5s between API calls

## Cost Estimation

Approximate costs per comparison:
- Input: ~$0.003 per 1K tokens
- Output: ~$0.015 per 1K tokens

For 6 clauses × 30 PDFs = 180 comparisons, expect approximately $4-15 total.

## Error Handling

The application handles:
- API connection errors
- PDF validation failures
- JSON parsing errors (with multiple fallback strategies)
- Invalid user inputs

All errors are displayed with user-friendly messages and detailed error information.

## License

Proprietary - Charles River Associates

