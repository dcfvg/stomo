import { RiFolderVideoLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { getProjectPreviewFrame } from "../storage/database";
import type { FrameSummary, ProjectRecord } from "../types";
import { FrameThumbnail } from "./FrameThumbnail";

interface ProjectCoverProps {
  project: ProjectRecord;
  color: "coral" | "cyan";
}

export function ProjectCover({ project, color }: ProjectCoverProps) {
  const [frame, setFrame] = useState<FrameSummary | null>(null);

  useEffect(() => {
    if (project.frameCount === 0) return;
    let alive = true;
    void getProjectPreviewFrame(project.id)
      .then((preview) => {
        if (alive && preview) setFrame(preview);
      })
      .catch(() => {
        // La carte colorée reste utilisable si la vignette est illisible.
      });
    return () => {
      alive = false;
    };
  }, [project.frameCount, project.id, project.updatedAt]);

  return (
    <div className={`project-cover project-cover--${color}`}>
      {frame ? (
        <FrameThumbnail
          className="project-cover__image"
          frame={frame}
          alt={`Aperçu du film ${project.name}`}
          loading="lazy"
        />
      ) : (
        <RiFolderVideoLine size={50} aria-hidden="true" />
      )}
      <span>
        {project.frameCount} photo{project.frameCount > 1 ? "s" : ""}
      </span>
    </div>
  );
}
