"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateExpertDialog } from "./create-expert-dialog";

export function NewExpertButton({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <CreateExpertDialog
      projects={projects}
      onCreated={(e) => router.push(`/experts/${e.id}`)}
      trigger={
        <Button>
          <UserPlus /> Ny ekspert
        </Button>
      }
    />
  );
}
