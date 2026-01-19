export function TypesettingPreviewPane() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-2 px-6">
        <div className="text-lg font-semibold text-foreground">Typesetting Preview</div>
        <p className="text-sm text-muted-foreground">
          This is a placeholder for the paged preview pipeline. Wire it to the
          typesetting engine output next.
        </p>
      </div>
    </div>
  );
}
