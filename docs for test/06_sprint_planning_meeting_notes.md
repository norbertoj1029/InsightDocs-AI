# Meeting Notes - InsightDocs AI Sprint Planning

**Date:** May 3, 2026  
**Attendees:** Maya Chen, Omar Patel, Lena Brooks, Jordan Smith  
**Meeting Type:** Sprint Planning

## Decisions

1. The MVP will use PostgreSQL with pgvector instead of a separate managed vector database for the first release.
2. The first AI provider will be OpenAI, but the backend must keep a provider abstraction so Claude or Gemini can be added later.
3. Document processing will be asynchronous using a job queue because large PDFs may take several minutes to parse and embed.
4. The team will include citations in every answer, even for summary requests.
5. The upload limit for MVP is 25 MB per file.

## Action Items

- Maya will design the upload dashboard and document status states by May 8.
- Omar will implement the document parser interface for PDF, DOCX, and TXT by May 12.
- Lena will create the pgvector schema and embedding storage migration by May 10.
- Jordan will set up API rate limiting and token usage logging by May 14.

## Risks

- Some PDFs may be scanned images and produce no useful text until OCR is added.
- Users may ask questions across too many documents, increasing token cost.
- Prompt injection inside uploaded documents could attempt to override system instructions.
- Missing citations may reduce trust in the generated answers.

## Open Questions

- Should workspace admins be able to delete another user's documents?
- Should the first release support document comparison?
- Which model should be used for low-cost summaries?
