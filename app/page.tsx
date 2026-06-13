import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { HeroBackdrop } from "@/components/hero-backdrop";
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
      {/* Global ambient backdrop — painted behind everything, never interactive */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-aurora opacity-70" />
        <div className="absolute inset-0 bg-grid-pan bg-radial-fade opacity-[0.35]" />
      </div>
      <Navbar />
      <main>
        {/* Hero + About share one sticky 3D backdrop so the animated terrain
            isn't clipped at the hero's bottom — it persists behind About and
            releases at the end of the combined region. */}
        <div className="relative">
          <HeroBackdrop />
          <Hero />
          <About />
        </div>
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
