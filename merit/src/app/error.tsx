"use client";

import { useEffect } from "react";
import { ErrorView } from "./ErrorView";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorView
      title="Bir sorun oluştu"
      message="Sayfa yüklenirken beklenmeyen bir hata oluştu. Yeniden deneyebilir ya da ana sayfaya dönebilirsiniz."
      retryLabel="Yeniden dene"
      homeLabel="Ana sayfa"
      onRetry={() => retry()}
      digest={error.digest}
    />
  );
}
