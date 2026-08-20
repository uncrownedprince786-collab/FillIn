// Generates sample fixtures for local testing of Fillin.
//
//   npm run fixtures
//
// Creates ./fixtures/ with:
//   profile.json            — a fictional profile (extract-ready)
//   resume.pdf              — a fictional resume (PDF)
//   cover-letter.pdf        — a fictional cover letter (PDF)
//   notes.txt               — fictional notes (text)
//   job-application.html    — a sample job-application form for manual testing
//   contact.html            — a sample contact form (mixed controls)
//
// All data is fictional (Farcaster-style placeholder persona). No real
// personal data is used.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "fixtures");
mkdirSync(outDir, { recursive: true });

const PERSONA = {
  name: "Ayesha Malik",
  email: "ayesha.malik@example.test",
  phone: "+92 300 5550198",
  linkedin: "https://linkedin.com/in/ayesha-malik",
  website: "https://ayeshamalik.example.test",
  address: {
    street: "14-A, Gulberg III",
    city: "Lahore",
    province: "Punjab",
    postalCode: "54000",
    country: "Pakistan",
  },
  education: [
    {
      institution: "University of the Punjab",
      degree: "BS Computer Science",
      field: "Computer Science",
      start: "2016",
      end: "2020",
      gpa: "3.7",
    },
    {
      institution: "Government College Lahore",
      degree: "FSc Pre-Engineering",
      field: "Pre-Engineering",
      start: "2014",
      end: "2016",
    },
  ],
  employment: [
    {
      company: "Nimbus Digital",
      jobTitle: "Frontend Engineer",
      start: "2021",
      end: "Present",
    },
    {
      company: "ByteWorks",
      jobTitle: "Junior Software Engineer",
      start: "2020",
      end: "2021",
    },
  ],
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Figma"],
  certifications: ["AWS Certified Cloud Practitioner", "Meta Front-End Developer"],
  languages: ["English", "Urdu", "Punjabi"],
  salaryExpected: "PKR 450,000 per month",
};

function write(name, data) {
  const file = join(outDir, name);
  writeFileSync(file, data);
  console.log(`[fixtures] wrote ${file}`);
}

async function makePdf(title, lines) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  let y = 760;
  const margin = 56;

  page.drawText(title, { x: margin, y, size: 20, font: bold, color: rgb(0.1, 0.1, 0.15) });
  y -= 34;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      page.drawText(line.slice(2), { x: margin, y, size: 13, font: bold, color: rgb(0.2, 0.2, 0.3) });
      y -= 20;
    } else if (line === "") {
      y -= 12;
    } else {
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 16;
    }
    if (y < 40) {
      y = 760;
      doc.addPage([612, 792]);
    }
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function run() {
  // profile.json — a profile in the shape of packages/schemas ProfileSchema.
  const now = Date.now();
  const facts = [];
  const pushFact = (key, value, source, confidence = "high") => {
    facts.push({
      key,
      value,
      sources: [{ documentId: source, documentName: source }],
      confidence,
      addedAt: now,
      updatedAt: now,
    });
  };
  pushFact("personal.fullName", PERSONA.name, "resume.pdf");
  pushFact("personal.firstName", "Ayesha", "resume.pdf");
  pushFact("personal.lastName", "Malik", "resume.pdf");
  pushFact("contact.email", PERSONA.email, "resume.pdf");
  pushFact("contact.phone", PERSONA.phone, "resume.pdf");
  pushFact("contact.linkedin", PERSONA.linkedin, "resume.pdf");
  pushFact("contact.website", PERSONA.website, "resume.pdf");
  pushFact("address.street", PERSONA.address.street, "resume.pdf");
  pushFact("address.city", PERSONA.address.city, "resume.pdf");
  pushFact("address.state", PERSONA.address.province, "resume.pdf");
  pushFact("address.postalCode", PERSONA.address.postalCode, "resume.pdf");
  pushFact("address.country", PERSONA.address.country, "resume.pdf");
  pushFact("education.institution", PERSONA.education[0].institution, "resume.pdf");
  pushFact("education.degree", PERSONA.education[0].degree, "resume.pdf");
  pushFact("education.field", PERSONA.education[0].field, "resume.pdf");
  pushFact("education.gpa", PERSONA.education[0].gpa, "resume.pdf");
  pushFact("employment.company", PERSONA.employment[0].company, "resume.pdf");
  pushFact("employment.jobTitle", PERSONA.employment[0].jobTitle, "resume.pdf");
  pushFact("skill.list", "React", "resume.pdf", "medium");
  pushFact("skill.list", "TypeScript", "resume.pdf", "medium");
  pushFact("skill.list", "Node.js", "resume.pdf", "medium");
  pushFact("certification.list", "AWS Certified Cloud Practitioner", "resume.pdf", "medium");
  pushFact("language.list", "English", "resume.pdf", "medium");
  pushFact("financial.salaryExpected", PERSONA.salaryExpected, "cover-letter.pdf", "medium");
  write(
    "profile.json",
    JSON.stringify({ version: 1, facts, conflicts: [], builtAt: now }, null, 2)
  );

  // resume.pdf
  const resumeLines = [
    "# Ayesha Malik",
    "Frontend Engineer",
    "",
    "Lahore, Punjab, Pakistan",
    PERSONA.email,
    PERSONA.phone,
    PERSONA.linkedin,
    PERSONA.website,
    "",
    "# Summary",
    "Frontend engineer with 5 years of experience building accessible, high-performance web applications.",
    "",
    "# Experience",
    "Frontend Engineer, Nimbus Digital (2021 - Present)",
    "Led the redesign of the core dashboard, improving load time by 40%.",
    "Introduced a TypeScript-first component library adopted by three teams.",
    "",
    "Junior Software Engineer, ByteWorks (2020 - 2021)",
    "Built REST APIs and React UIs for internal tooling.",
    "",
    "# Education",
    "BS Computer Science, University of the Punjab (2016 - 2020), CGPA: 3.7",
    "",
    "# Skills",
    "React, TypeScript, Node.js, PostgreSQL, Figma",
    "",
    "# Certifications",
    "AWS Certified Cloud Practitioner, Meta Front-End Developer",
    "",
    "# Languages",
    "English, Urdu, Punjabi",
  ];
  write("resume.pdf", await makePdf("Ayesha Malik - Resume", resumeLines));

  // cover-letter.pdf
  const coverLines = [
    "# Cover Letter",
    "",
    "Dear Hiring Team,",
    "",
    "I am applying for the Frontend Engineer role at Nimbus Digital. I have 5 years of experience building web applications with React and TypeScript.",
    "",
    "My expected monthly compensation is PKR 450,000.",
    "",
    "Best regards,",
    "Ayesha Malik",
    PERSONA.email,
    PERSONA.phone,
  ];
  write("cover-letter.pdf", await makePdf("Ayesha Malik - Cover Letter", coverLines));

  // notes.txt — fictional text to exercise the local hint extractor.
  const notes = [
    "Ayesha Malik",
    "aliases: Ayesha Malik (personal references)",
    "email: ayesha.malik@example.test",
    "phone: +92 300 5550198",
    "linkedin.com/in/ayesha-malik",
    "Date of birth: 1998-05-14 (placeholder — not a real date)",
  ].join("\n");
  write("notes.txt", notes);

  // job-application.html — a realistic form with labels, sections, radio, select.
  const form1 = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Nimbus Digital — Frontend Engineer Application</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; color: #222; }
    section { border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
    input, select, textarea { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    .row { display: flex; gap: 1rem; }
    .row > div { flex: 1; }
  </style>
</head>
<body>
  <h1>Frontend Engineer Application</h1>
  <form id="application">
    <section>
      <h2>Personal information</h2>
      <div class="row">
        <div>
          <label for="first-name">First name</label>
          <input id="first-name" name="firstName" autocomplete="given-name" />
        </div>
        <div>
          <label for="last-name">Last name</label>
          <input id="last-name" name="lastName" autocomplete="family-name" />
        </div>
      </div>
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="email" />
      <label for="phone">Phone number</label>
      <input id="phone" name="phone" type="tel" autocomplete="tel" />
      <label for="linkedin">LinkedIn URL</label>
      <input id="linkedin" name="linkedin" type="url" />
      <label for="portfolio">Portfolio / personal website</label>
      <input id="portfolio" name="portfolio" type="url" />
    </section>

    <section>
      <h2>Address</h2>
      <label for="street">Street address</label>
      <input id="street" name="street" autocomplete="street-address" />
      <div class="row">
        <div>
          <label for="city">City</label>
          <input id="city" name="city" autocomplete="address-level2" />
        </div>
        <div>
          <label for="postal">Postal code</label>
          <input id="postal" name="postal" autocomplete="postal-code" />
        </div>
      </div>
      <label for="country">Country</label>
      <select id="country" name="country">
        <option value="">Select a country</option>
        <option>Pakistan</option>
        <option>United States</option>
        <option>United Kingdom</option>
      </select>
    </section>

    <section>
      <h2>Employment</h2>
      <label for="company">Current company</label>
      <input id="company" name="company" />
      <label for="title">Job title</label>
      <input id="title" name="title" />
      <label for="skills">Key skills</label>
      <textarea id="skills" name="skills" rows="3"></textarea>
      <label for="salary">Expected monthly salary</label>
      <input id="salary" name="salary" />
    </section>

    <section>
      <h2>Documents</h2>
      <label for="resume">Resume (PDF)</label>
      <input id="resume" name="resume" type="file" accept=".pdf" />
      <label for="cover">Cover letter</label>
      <input id="cover" name="cover" type="file" accept=".pdf" />
    </section>

    <section>
      <h2>Eligibility</h2>
      <p>Are you legally authorized to work in Pakistan?</p>
      <label><input type="radio" name="authorized" value="yes" /> Yes</label>
      <label><input type="radio" name="authorized" value="no" /> No</label>
      <label><input type="checkbox" name="privacy" /> I agree to the privacy policy</label>
    </section>

    <button type="submit">Submit application</button>
  </form>
</body>
</html>`;
  write("job-application.html", form1);

  // contact.html — a contact form with autofill-safe fields.
  const form2 = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contact — Ayesha Malik Studio</title>
</head>
<body>
  <h1>Contact</h1>
  <form id="contact">
    <label for="fullname">Full name</label>
    <input id="fullname" name="fullname" autocomplete="name" />
    <label for="contact-email">E-mail</label>
    <input id="contact-email" name="contactEmail" type="email" autocomplete="email" />
    <label for="subject">Subject</label>
    <input id="subject" name="subject" />
    <label for="message">Message</label>
    <textarea id="message" name="message" rows="5"></textarea>
    <label for="subscribe">Subscribe to newsletter</label>
    <input id="subscribe" name="subscribe" type="checkbox" />
    <button type="submit">Send</button>
  </form>
</body>
</html>`;
  write("contact.html", form2);

  console.log("[fixtures] done →", outDir);
}

run().catch((err) => {
  console.error("[fixtures] failed:", err);
  process.exit(1);
});
