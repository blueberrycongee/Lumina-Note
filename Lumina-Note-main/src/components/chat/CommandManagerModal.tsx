import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { SlashCommand } from "@/stores/useCommandStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface CommandManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (cmd: Omit<SlashCommand, "id">) => void;
    initialData?: SlashCommand | null;
}

export function CommandManagerModal({
    isOpen,
    onClose,
    onSave,
    initialData,
}: CommandManagerModalProps) {
    const { t } = useLocaleStore();
    const [key, setKey] = useState("");
    const [description, setDescription] = useState("");
    const [prompt, setPrompt] = useState("");

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setKey(initialData.key);
                setDescription(initialData.description);
                setPrompt(initialData.prompt);
            } else {
                setKey("");
                setDescription("");
                setPrompt("");
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!key.trim() || !prompt.trim()) return;

        // Remove leading slash if user added it
        const cleanKey = key.trim().replace(/^\//, "");

        onSave({
            key: cleanKey,
            description: description.trim(),
            prompt: prompt,
        });
        onClose();
    };

    return (
        <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-background border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="font-medium">
                        {initialData ? t.ai.slashCommands.editShortcut : t.ai.slashCommands.createShortcut}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-muted rounded-md transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">
                            {t.ai.slashCommands.triggerKey}
                        </label>
                        <div className="relative flex items-center">
                            <span className="absolute left-3 text-muted-foreground">/</span>
                            <input
                                type="text"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder={t.ai.slashCommands.triggerKeyPlaceholder}
                                className="w-full pl-6 pr-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                autoFocus
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t.ai.slashCommands.triggerKeyHint}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">
                            {t.ai.slashCommands.description}
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t.ai.slashCommands.descriptionPlaceholder}
                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">
                            {t.ai.slashCommands.prompt}
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t.ai.slashCommands.promptPlaceholder}
                            rows={4}
                            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                        />
                        <p className="text-xs text-muted-foreground">
                            {t.ai.slashCommands.promptHint}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm hover:bg-muted rounded-md transition-colors"
                        >
                            {t.ai.slashCommands.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={!key.trim() || !prompt.trim()}
                            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
                        >
                            {t.ai.slashCommands.save}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
