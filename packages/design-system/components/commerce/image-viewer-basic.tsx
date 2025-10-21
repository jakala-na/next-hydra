"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@radix-ui/react-dialog";
import { cn } from "@repo/design-system/lib/utils";
import { MinusCircle, PlusCircle, X } from "lucide-react";
import Image from "next/image";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

interface ImageViewerProps {
  className?: string;
  classNameImageViewer?: string;
  classNameThumbnailViewer?: string;
  imageTitle?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  placeholderUrl?: string;
  Placeholder?: React.ComponentType<{ className?: string }>;
  showControls?: boolean;
}

const ImageViewer_Basic = ({
  className,
  classNameImageViewer,
  classNameThumbnailViewer,
  imageTitle,
  imageUrl,
  placeholderUrl,
  showControls = true,
  thumbnailUrl,
}: ImageViewerProps) => {
  const handleImgError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    console.error("Image failed to load", event.currentTarget.src);
    if (placeholderUrl) {
      event.currentTarget.src = placeholderUrl;
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className={cn("cursor-pointer", className)}>
          <Image
            src={thumbnailUrl || imageUrl}
            alt={`${imageTitle ?? ""}`}
            width={500}
            height={500}
            className={cn(
              "h-auto w-full rounded-lg object-contain transition-opacity hover:opacity-90",
              classNameThumbnailViewer
            )}
            onError={handleImgError}
          />
        </div>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogContent className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-0">
          <DialogTitle className="sr-only">{imageTitle || "Image"}</DialogTitle>
          <DialogDescription className="sr-only">
            {imageTitle || "Image"}
          </DialogDescription>
          <div className="relative flex h-screen w-screen items-center justify-center">
            <TransformWrapper
              initialScale={1}
              initialPositionX={0}
              initialPositionY={0}
            >
              {({ zoomIn, zoomOut }) => (
                <>
                  <TransformComponent>
                    <Image
                      src={imageUrl}
                      alt={`${imageTitle ?? ""}`}
                      className={cn(
                        "h-auto max-h-[90vh] w-full max-w-[90vw] object-contain",
                        classNameImageViewer
                      )}
                      width={1000}
                      height={1000}
                      onError={handleImgError}
                    />
                  </TransformComponent>
                  {showControls && (
                    <div className="-translate-x-1/2 absolute bottom-4 left-1/2 z-10 flex gap-2">
                      <button
                        type="button"
                        onClick={() => zoomOut()}
                        className="cursor-pointer rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                        aria-label="Zoom out"
                      >
                        <MinusCircle className="size-6" />
                      </button>
                      <button
                        type="button"
                        onClick={() => zoomIn()}
                        className="cursor-pointer rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                        aria-label="Zoom in"
                      >
                        <PlusCircle className="size-6" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </TransformWrapper>
            <DialogClose asChild>
              <button
                type="button"
                className="absolute top-4 right-4 z-10 cursor-pointer rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                aria-label="Close"
              >
                <X className="size-6" />
              </button>
            </DialogClose>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ImageViewer_Basic;
