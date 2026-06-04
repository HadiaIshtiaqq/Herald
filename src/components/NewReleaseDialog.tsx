import { useState, FormEvent } from "react";
import { X, SendHorizontal, CodeXml } from "lucide-react";
import { PRType } from "../types";

interface NewReleaseDialogProps {
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    authorName: string;
    type: PRType;
    branch: string;
    description: string;
    reviewer: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
  }) => Promise<void>;
}

export default function NewReleaseDialog({ onClose, onSubmit }: NewReleaseDialogProps) {
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("Monica Davis");
  const [type, setType] = useState<PRType>("FEATURE");
  const [branch, setBranch] = useState("");
  const [description, setDescription] = useState("");
  const [reviewer, setReviewer] = useState("Sarah Jenkins");
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>("Medium");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Please enter a release or PR title.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        authorName,
        type,
        branch: branch || `${type.toLowerCase()}/custom-${Math.floor(100 + Math.random() * 900)}`,
        description: description || "Manual override deployment synced and submitted.",
        reviewer,
        priority
      });
      setIsSubmitting(false);
      onClose();
    } catch {
      setIsSubmitting(false);
      alert("Failed to register the release queue.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-[#EDEBE9] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-100 flex flex-col">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#EDEBE9] flex justify-between items-center bg-gray-50/50">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#201F1E] flex items-center gap-2">
            <CodeXml className="w-5 h-5 text-primary" />
            Trigger Manual Release Queue
          </h2>
          <button 
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-title">
              Pull Request Title *
            </label>
            <input
              id="pr-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#201F1E] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-gray-400"
              placeholder="e.g. feat: Implement Slack API webhook notifications"
            />
          </div>

          {/* Author & Type Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Author */}
            <div>
              <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-author">
                Author Profile
              </label>
              <select
                id="pr-author"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#201F1E] bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer"
              >
                <option value="Monica Davis">Monica Davis (@dev_monica)</option>
                <option value="Alex Chen">Alex Chen (@alex_chen)</option>
                <option value="Sarah Miller">Sarah Miller (@sarah_m)</option>
                <option value="John Doe">John Doe (@john_doe)</option>
                <option value="Elena Rodriguez">Elena Rodriguez (@elena_r)</option>
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-type">
                Relayout Change Type
              </label>
              <select
                id="pr-type"
                value={type}
                onChange={(e) => setType(e.target.value as PRType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#201F1E] bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer"
              >
                <option value="FEATURE">FEATURE</option>
                <option value="BUGFIX">BUGFIX</option>
                <option value="CHORE">CHORE</option>
                <option value="REFACTOR">REFACTOR</option>
              </select>
            </div>

          </div>

          {/* Target Branch, Assigned Reviewer & Priority Level Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Target Branch */}
            <div>
              <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-branch">
                Target Branch
              </label>
              <input
                id="pr-branch"
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#201F1E] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-gray-400 font-mono text-xs"
                placeholder="e.g. feature/slack-webhooks"
              />
            </div>

            {/* Assigned Reviewer */}
            <div>
              <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-reviewer">
                Reviewer
              </label>
              <select
                id="pr-reviewer"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-[#201F1E] bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer h-[38px]"
              >
                <option value="Sarah Jenkins">Sarah Jenkins</option>
                <option value="Alex Rover">Alex Rover</option>
                <option value="Emily Diaz">Emily Diaz</option>
                <option value="Carter Smith">Carter Smith</option>
              </select>
            </div>

            {/* Priority Level */}
            <div>
              <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-priority">
                Priority Level
              </label>
              <select
                id="pr-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-bold text-[#201F1E] bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer h-[38px]"
              >
                <option value="Low">Low 🟢</option>
                <option value="Medium">Medium 🟡</option>
                <option value="High">High 🟠</option>
                <option value="Critical">Critical 🔴</option>
              </select>
            </div>
          </div>

          {/* Detailed Changeset Description */}
          <div>
            <label className="block text-xs font-bold text-[#605E5C] uppercase tracking-wider mb-1.5" htmlFor="pr-desc">
              Codebase Description (Enables Gemini to generate detailed notes)
            </label>
            <textarea
              id="pr-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-[#201F1E] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-gray-400 leading-normal"
              placeholder="Supply code changes, classes injected, or middleware optimizations here..."
            />
          </div>

          {/* Footer controls */}
          <div className="pt-3 border-t border-[#EDEBE9] flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#EDEBE9] hover:bg-gray-50 rounded-lg text-xs font-bold text-[#404752] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-primary hover:bg-[#007cd4] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              <SendHorizontal className="w-4 h-4" />
              {isSubmitting ? "Queueing..." : "Submit to Release Queue"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
