import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ConstellationBackdrop } from "@/components/hero-backdrop";
import { Hero } from "@/components/sections/hero";
import { About } from "@/components/sections/about";
import { Skills } from "@/components/sections/skills";
import { Experience } from "@/components/sections/experience";
import { Projects } from "@/components/sections/projects";
import { Education } from "@/components/sections/education";
import { Contact } from "@/components/sections/contact";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* The morphing particle constellation IS the backdrop — one fixed,
          page-spanning layer that morphs brain → bulb → globe across scroll. */}
      <ConstellationBackdrop />
      <Navbar />
      <main>
        <Hero />
        <About />
        <Skills />
        <Experience />
        <Projects />
        <Education />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
