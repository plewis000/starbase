"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscapeKey);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, handleEscapeKey]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn ${
        isMobile ? "flex items-end" : "flex items-center justify-center p-4"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`bg-dungeon-850 border border-dungeon-700 shadow-dungeon-lg w-full ${
          isMobile
            ? "rounded-t-2xl max-h-[90vh] animate-slideUp"
            : `rounded-xl ${sizeClasses[size]} animate-scaleIn`
        }`}
      >
        {/* Drag handle (mobile) */}
        {isMobile && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-dungeon-600" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dungeon-700">
          <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">{title}</h2>
          <button
            onClick={onClose}
            className="text-dungeon-500 hover:text-slate-100 transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close modal"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={`px-6 py-4 overflow-y-auto ${isMobile ? "max-h-[calc(90vh-8rem)]" : "max-h-[85vh]"}`}>{children}</div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
