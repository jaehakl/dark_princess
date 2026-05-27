import { useEffect, useMemo } from 'react';

export function useChildrenImagePreviewUrl(
  value: unknown,
  pendingFile: File | null
) {
  const pendingImageUrl = useMemo(
    () =>
      pendingFile?.type.startsWith('image/')
        ? URL.createObjectURL(pendingFile)
        : null,
    [pendingFile]
  );

  useEffect(() => {
    return () => {
      if (pendingImageUrl) {
        URL.revokeObjectURL(pendingImageUrl);
      }
    };
  }, [pendingImageUrl]);

  return (
    pendingImageUrl ??
    (typeof value === 'string' && value.trim() ? value.trim() : null)
  );
}
