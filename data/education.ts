export type Education = {
  qualification: string;
  institution: string;
  location: string;
  period: string;
  detail?: string;
};

export const education: Education[] = [
  {
    qualification: "Executive Post Graduate Program — Blockchain",
    institution: "IIIT Bangalore",
    location: "Karnataka, India",
    period: "Dec 2021 — Jan 2023",
  },
  {
    qualification: "B.Tech — Computer Science",
    institution: "Alliance College of Engineering and Design",
    location: "Bengaluru, India",
    period: "Aug 2014 — Apr 2021",
    detail: "GPA: 58.6",
  },
];

export type Accomplishment = {
  title: string;
  issuer: string;
  details: string[];
};

export const accomplishments: Accomplishment[] = [
  {
    title: "PG Certification in Full Stack Development",
    issuer: "UpGrad",
    details: [
      "Object Oriented Analysis, Design and Programming",
      "Data Structures and Algorithms",
      "Web Development — HTML and CSS",
      "JavaScript",
      "Server-Side Communication — JSON and AJAX",
      "React + Redux",
      "Node.js, Express.js and MongoDB",
    ],
  },
];
