import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import marcoLogo from "@/assets/marco-logo.png";

// eslint-disable-next-line max-lines-per-function
export function GlobalAboutView() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">About</h2>
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-3">
            <img src={marcoLogo} alt="Marco logo" className="h-16 w-16 rounded-lg" />
            <div>
              <h3 className="font-bold">Marco Extension</h3>
              <p className="text-xs text-muted-foreground">
                Browser automation and script injection platform
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Schema Version</span>
            <Badge variant="outline" className="text-[10px]">v1</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Marco manages project-based script injection with configurable URL rules,
            timing controls, and variable injection for browser automation workflows.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="font-bold text-sm text-center">Author</div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-semibold">
              <a href="https://www.google.com/search?q=alim+ul+karim" target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80">Md. Alim Ul Karim</a>
            </p>
            <p className="text-xs text-muted-foreground">
              <a href="https://alimkarim.com" target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 font-semibold">Creator & Lead Architect</a>
              {" | "}
              <a href="https://www.google.com/search?q=alim+ul+karim" target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80">Chief Software Engineer</a>
              {", "}
              <a href="https://riseup-asia.com" target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80">Riseup Asia LLC</a>
            </p>
            <p className="text-xs font-medium text-primary">
              <a href="https://riseup-asia.com" target="_blank" rel="noopener noreferrer"
                className="hover:text-primary/80">Riseup Asia LLC</a>
              {" — Top Leading Software Company in Wyoming (2026)"}
            </p>
            <p className="text-xs text-muted-foreground">20+ years of programming experience</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              Known for inventing an automatic unit test generation tool before AI in 2018 — capable of writing code and unit tests automatically.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Created to help developers automate repetitive browser tasks more effectively.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <a href="https://alimkarim.com" target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
              alimkarim.com
            </a>
            <a href="https://riseup-asia.com" target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
              riseup-asia.com
            </a>
            <a href="https://www.linkedin.com/in/alaboratory/" target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
              LinkedIn
            </a>
            <a href="https://stackoverflow.com/users/513511/md-alim-ul-karim" target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
              Stack Overflow
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default GlobalAboutView;
