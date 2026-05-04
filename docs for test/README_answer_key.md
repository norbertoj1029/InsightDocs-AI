# InsightDocs AI Test Document Set - Answer Key

Use these files to test upload, parsing, chunking, embeddings, RAG, summaries, citations, risk detection, and document comparison.

## Suggested Test Questions

### Service Agreement
- What is the monthly subscription fee?  
  Expected: USD 4,800.
- What are the payment terms?  
  Expected: invoices issued first business day; payment due within 30 days from invoice date.
- What is the late payment interest?  
  Expected: 1.5% per month or maximum allowed by law, whichever is lower.
- How much notice is required for non-renewal?  
  Expected: at least 60 days before the end of the current term.
- What is the security incident notification period?  
  Expected: within 72 hours after confirmation.
- What law governs the agreement?  
  Expected: State of Delaware law.

### Statement of Work
- What is the project objective?  
  Expected: build an AI-powered support assistant using RAG over approved policy documents and knowledge base articles.
- What is the target production launch date?  
  Expected: August 1, 2026.
- What is the fixed implementation fee?  
  Expected: USD 86,000.
- What are the payment milestones?  
  Expected: 30% at signing, 40% after pilot release, 30% after production launch.
- What is an important risk or assumption?  
  Expected: AI answer quality depends on source documents; no binding legal/coverage decisions without human review.

### Invoice
- What is the invoice number?  
  Expected: INV-2026-0417.
- What is the total due?  
  Expected: USD 7,200.
- What is the due date?  
  Expected: May 31, 2026.
- What are the payment terms?  
  Expected: Net 30.

### Remote Work and Data Security Policy
- Are personal devices allowed to store confidential files?  
  Expected: No.
- What is the MFA requirement?  
  Expected: all business systems require multi-factor authentication.
- What information is confidential?  
  Expected: customer records, contracts, payroll files, source code, API keys, and security logs.
- Can confidential data be pasted into public AI tools?  
  Expected: No, unless using company-approved AI service with data processing agreement.
- How soon must suspicious incidents be reported?  
  Expected: within 24 hours.

### InsightDocs MVP Requirements
- What file types are supported?  
  Expected: PDF, DOCX, TXT.
- What is the maximum upload size?  
  Expected: 25 MB.
- What chunking strategy is required?  
  Expected: about 800 tokens with 150-token overlap.
- Is OCR included in MVP?  
  Expected: No, OCR for scanned images is out of scope.

### Sprint Planning Notes
- Which vector database choice was made?  
  Expected: PostgreSQL with pgvector.
- Which AI provider is first?  
  Expected: Groq (`GROQ_API_KEY`, `src/lib/groq-client.ts`).
- Why use async processing?  
  Expected: large PDFs may take several minutes to parse and embed.
- What are major risks?  
  Expected: scanned PDFs, high token cost, prompt injection, missing citations.

## Features These Documents Test

- PDF parsing
- DOCX parsing
- TXT/Markdown parsing
- JSON metadata parsing
- Long-form contract Q&A
- Invoice extraction
- Policy compliance Q&A
- Requirements summarization
- Meeting action item extraction
- RAG citations by file name and page/section
- Cross-document questions
- Risk detection
- Token usage tracking
