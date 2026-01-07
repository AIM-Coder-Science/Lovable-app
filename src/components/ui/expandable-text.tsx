import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export const ExpandableText = ({ text, maxLength = 200, className = "" }: ExpandableTextProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (text.length <= maxLength) {
    return <p className={`whitespace-pre-wrap ${className}`}>{text}</p>;
  }

  return (
    <div className={className}>
      <p className="whitespace-pre-wrap">
        {isExpanded ? text : `${text.slice(0, maxLength)}...`}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-auto py-1 px-2 text-primary hover:text-primary/80"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-4 h-4 mr-1" />
            Réduire
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4 mr-1" />
            Lire plus
          </>
        )}
      </Button>
    </div>
  );
};
