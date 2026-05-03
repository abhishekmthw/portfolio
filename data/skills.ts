export type SkillGroup = {
  category: string;
  items: string[];
};

export const skills: SkillGroup[] = [
  {
    category: "Languages",
    items: ["JavaScript", "TypeScript"],
  },
  {
    category: "Frontend",
    items: [
      "React.js",
      "Next.js",
      "Vite",
      "Redux",
      "HTML5",
      "CSS3",
      "Tailwind CSS",
    ],
  },
  {
    category: "Backend",
    items: [
      "Node.js",
      "Express.js",
      "Koa",
      "RESTful APIs",
      "GraphQL",
      "TypeORM",
    ],
  },
  {
    category: "Cloud & Infra",
    items: [
      "AWS Lambda",
      "AWS Cognito",
      "AWS API Gateway",
      "AWS S3",
      "AWS SQS",
      "AWS SNS",
      "AWS CloudWatch",
    ],
  },
  {
    category: "Databases",
    items: ["PostgreSQL", "MySQL", "MongoDB", "DynamoDB"],
  },
  {
    category: "Architecture",
    items: [
      "Microservices",
      "Event-Driven Architecture",
      "Serverless",
      "gRPC",
      "Shopify Polaris",
    ],
  },
];
