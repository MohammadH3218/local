# HandyCall

**Multi-tenant AI Receptionist Platform for Local Service Businesses**

HandyCall is a production-grade SaaS platform that provides AI-powered receptionist services for local service businesses (handyman, pest control, electricians, etc.). The system handles inbound calls and texts, answers questions using business-specific knowledge, captures leads, and manages appointment scheduling.

## 🏗️ Architecture

This is a monorepo containing:

- **Backend API** (`packages/backend`) - NestJS + TypeScript + DynamoDB
- **Web Dashboard** (`packages/web`) - Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **Mobile App** (`packages/mobile`) - React Native + Expo
- **Shared Types** (`packages/shared`) - Common TypeScript types and utilities

## 📚 Documentation

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Single source of truth for the entire project
- [DB_SCHEMA.md](./DB_SCHEMA.md) - DynamoDB table designs and access patterns
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API endpoint documentation
- [docs/REALTIME_SIP_REWORK.md](./docs/REALTIME_SIP_REWORK.md) - **Realtime Voice Architecture** (Twilio Media Streams + OpenAI)
- [docs/TWILIO_MEDIA_STREAMS_SETUP.md](./docs/TWILIO_MEDIA_STREAMS_SETUP.md) - Twilio Bridge Setup Guide

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- AWS CLI configured
- AWS account with appropriate permissions

### Installation

```bash
# Install all dependencies
npm install

# Build shared types
npm run shared:build
```

### Development

```bash
# Run all services in development mode
npm run dev

# Or run individually:
npm run backend:dev  # API server
npm run web:dev      # Web dashboard
npm run mobile:dev   # Mobile app
```

## 🏢 Multi-Tenancy

Every resource in the system is scoped by `company_id`. Data isolation is enforced at the service layer to ensure complete tenant separation.

## 🔒 Security

- JWT-based authentication
- Company-scoped data access
- RAG retrieval never crosses tenant boundaries
- Production-ready security patterns

## 📱 Platform Features

### Core Capabilities
- Automated inbound call/text handling
- AI-powered receptionist with business disclosure
- RAG-based knowledge retrieval (company-specific)
- Lead capture and management
- Appointment booking (multiple modes)
- Call recording and transcription
- Flagged question learning loop

### For Business Owners
- Clean, professional dashboard
- Teach AI new answers through simple interface
- Call replay with highlights
- Lead and appointment management
- Mobile-first design for field workers

## 🛠️ Tech Stack

- **Frontend**: Next.js, React Native (Expo), TypeScript, Tailwind CSS
- **Backend**: NestJS, TypeScript
- **Database**: AWS DynamoDB
- **Storage**: AWS S3
- **Hosting**: AWS Amplify (web), AWS infrastructure (API)
- **AI/ML**: RAG with vector embeddings, LLM integration

## 📦 Project Structure

```
HandyCall/
├── packages/
│   ├── backend/       # NestJS API server
│   ├── web/           # Next.js web dashboard
│   ├── mobile/        # React Native mobile app
│   └── shared/        # Shared TypeScript types
├── docs/              # Additional documentation
├── scripts/           # Deployment and utility scripts
└── [documentation files]
```

## 🧪 Testing

```bash
npm run test
```

## 🏗️ Build

```bash
npm run build
```

## 📄 License

Proprietary - All rights reserved

## 👥 Support

For issues and questions, please refer to the documentation in the `/docs` folder.
