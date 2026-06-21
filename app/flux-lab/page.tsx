import { FluxLab } from "@/components/flux-lab/flux-lab";

// Throwaway preview route for comparing candidate "flux" structures. Not linked from
// the site; visit /flux-lab directly. Delete components/flux-lab + this route once a
// structure is chosen and wired into the production particle field.
export default function FluxLabPage() {
  return <FluxLab />;
}
