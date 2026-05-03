export type Experience = {
  role: string;
  company: string;
  location: string;
  remote?: boolean;
  period: string;
  current?: boolean;
  bullets: string[];
};

export const experience: Experience[] = [
  {
    role: "Software Developer",
    company: "MedVol Data Solutions",
    location: "Mumbai, India",
    remote: true,
    period: "Jan 2023 — Present",
    current: true,
    bullets: [
      "Migrated the legacy ASP.NET application to the MERN stack, owning the work end to end.",
      "Built the new backend on Node.js + Express with PostgreSQL and TypeORM.",
      "Collaborated across the full SDLC — from requirement gathering through production releases.",
      "Deployed and authenticated via AWS — Cognito for user management, Lambda for custom triggers and OTP verification.",
      "Implemented password-less sign-in for mobile apps via SMS authentication.",
      "Used API Gateway for secure routing, S3 for file storage, and SQS to queue large MS Excel report generations.",
      "Designed an event-driven architecture for seamless data sync across multiple databases in a microservices setup.",
    ],
  },
  {
    role: "Full Stack Developer",
    company: "AppAttic Private Limited",
    location: "Bristol, UK",
    remote: true,
    period: "Apr 2022 — Nov 2022",
    bullets: [
      "Software lead on a Shopify-app project I owned end to end.",
      "Built the app on Next.js with DynamoDB; serverless API endpoints via Next.js routes.",
      "Designed the merchant-facing UI with Shopify Polaris.",
      "Used AWS Lambda, SNS and CloudWatch to queue and absorb large bursts of API calls without overloading the servers.",
    ],
  },
  {
    role: "Software Engineer",
    company: "Focaloid Technologies",
    location: "Kochi, India",
    period: "Sep 2021 — Mar 2022",
    bullets: [
      "Built a customer-chat service tailored to client requirements.",
      "Implemented GraphQL queries, mutations and subscriptions on the backend.",
      "Integrated WhatsApp as a customer-side chat entry point into the application.",
    ],
  },
  {
    role: "Full Stack Intern",
    company: "ePaisa Services India",
    location: "Mumbai, India",
    period: "Jun 2021 — Aug 2021",
    bullets: [
      "Picked up GraphQL, microservices, gRPC, AngularJS and TypeScript on the job.",
      "Wrote and tested GraphQL queries against internal APIs.",
      "Performed QA on both the production app and its in-progress beta.",
    ],
  },
];
