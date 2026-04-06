import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";
import { getStatusBucketColor } from "./network-helpers";

interface StatusDistributionProps {
  byStatus: Record<string, number>;
}

/** Card showing count badges per HTTP status bucket. */
export function StatusDistribution({ byStatus }: StatusDistributionProps) {
  const buckets = Object.entries(byStatus);
  const isEmpty = buckets.length === 0;

  if (isEmpty) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Globe className="inline h-4 w-4 mr-1.5" />
          Status Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {buckets.map(([bucket, count]) => (
            <Badge
              key={bucket}
              variant="outline"
              className={`text-xs px-2.5 py-1 ${getStatusBucketColor(bucket)}`}
            >
              {bucket}: {count}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
