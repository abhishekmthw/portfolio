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

/** Empty scroll runway between two content sections. The constellation's morph /
 *  scatter / spin plays out HERE, where no content is on screen, so transitions
 *  never overlap readable content. 100lvh (not svh) keeps the gap >= the JS
 *  window.innerHeight the particle field measures against, so the scrub window is
 *  never collapsed. Collapses to 0 under reduced motion (no morph runs then). */
function Gap() {
  return <div aria-hidden="true" className="pointer-events-none h-[100lvh] motion-reduce:h-0" />;
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* The morphing particle constellation IS the backdrop — one fixed,
          page-spanning layer that morphs brain → gear → { } → </> → globe across scroll. */}
      <ConstellationBackdrop />
      <Navbar />
      <main>
        <Hero />
        <Gap />
        <About />
        <Gap />
        <Skills />
        <Gap />
        <Experience />
        <Gap />
        <Projects />
        <Gap />
        <Education />
        <Gap />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
