import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: number | string;
}

/** Compact stat card with hover lift animation. */
export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="hover-lift">
      <Card className="hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
        <CardContent className="p-4 text-center">
          <div className="text-lg font-bold anim-scale-bounce">
            {value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </div>
  );
}
