import { Brain, FileCode, CheckCircle, Mail, FolderHeart, Zap, Sparkles, Scroll, Users } from "lucide-react";

interface MarketingPageProps {
  onBackToApp: () => void;
}

export default function MarketingPage({ onBackToApp }: MarketingPageProps) {
  return (
    <div className="flex-1 bg-white overflow-y-auto">
      
      {/* Hero Section Container with subtle radiant gradients */}
      <section className="relative px-6 py-16 md:py-24 max-w-[1440px] mx-auto w-full flex flex-col items-center text-center bg-[radial-gradient(circle_at_top_right,rgba(0,120,212,0.04),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(16,124,16,0.02),transparent_30%)]">
        
        {/* Next-Gen Release Badging */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 border border-blue-100/50 text-[#0078D4] rounded-full text-xs font-bold leading-none mb-6 shadow-sm select-none">
          <Zap className="w-3.5 h-3.5 fill-[#0078D4]" />
          Next-Gen AI Release Management
        </div>

        {/* Big Display Headline */}
        <h1 className="text-3xl md:text-5xl font-extrabold text-[#1a1c1c] tracking-tight leading-[1.1] max-w-2xl font-sans">
          Ship with Confidence, <br />
          <span className="text-[#005faa]">Not Prose.</span>
        </h1>

        {/* Bullet descriptions */}
        <p className="text-sm md:text-base text-[#404752] mt-6 max-w-lg leading-relaxed font-sans">
          HERALD parses every merged pull request into a fully documented, risk-assessed, organization-wide rollout in under two minutes.
        </p>

        {/* CTA triggers */}
        <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full justify-center max-w-sm">
          <button 
            onClick={onBackToApp}
            className="flex-1 bg-primary hover:bg-[#0078D4] text-white py-3.5 px-8 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-transform transition-all active:scale-95 cursor-pointer"
          >
            Launch Console
          </button>
          <button 
            onClick={() => alert("Request Demo queued! Our DevOps team will contact you soon.")}
            className="flex-1 bg-[#F3F2F1] hover:bg-gray-200 text-[#201F1E] py-3.5 px-8 rounded-xl text-sm font-bold transition-all border border-[#EDEBE9] active:scale-95 cursor-pointer"
          >
            Request Demo
          </button>
        </div>

        {/* Dashboard Mockup Picture as requested in the mockup */}
        <div className="mt-14 w-full max-w-3xl rounded-2xl border border-[#EDEBE9] p-2 bg-[#f9f9f9] shadow-inner select-none transition-transform hover:scale-[1.01] duration-300">
          <div className="rounded-xl overflow-hidden bg-gradient-to-br from-[#121824] to-[#1e2a38] text-white p-6 relative min-h-[220px] md:min-h-[280px] flex flex-col justify-between text-left">
            
            {/* Pseudo browser window dots */}
            <div className="flex gap-1.5 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-400"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
              <span className="w-3 h-3 rounded-full bg-green-400"></span>
            </div>

            <div className="space-y-4">
              <div className="h-6 w-48 bg-white/10 rounded animate-pulse"></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-16 bg-white/5 rounded border border-white/10 p-2 text-[10px] text-gray-300">
                  <span className="block font-bold">HERALD COGNITION</span>
                  <span className="text-blue-200 mt-1 block">99.2% accuracy</span>
                </div>
                <div className="h-16 bg-white/5 rounded border border-white/10 p-2 text-[10px] text-gray-300">
                  <span className="block font-bold">ACTIVE SCAN RATE</span>
                  <span className="text-emerald-300 mt-1 block">Live pipeline sync</span>
                </div>
                <div className="h-16 bg-white/5 rounded border border-white/10 p-2 text-[10px] text-gray-300">
                  <span className="block font-bold">INTEGRATED MODULES</span>
                  <span className="text-purple-300 mt-1 block">GitHub / Azure</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-between items-center text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                Auto-analyzing releases...
              </span>
              <span>v2.4.1 Stable build active</span>
            </div>

          </div>
        </div>

      </section>

      {/* Feature Deep Dive details layout */}
      <section className="px-6 py-16 bg-[#f4f3f2] border-t border-b border-[#EDEBE9]">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Feature Card 1: Agentic Reasoning */}
          <div className="bg-white p-8 rounded-2xl border border-[#EDEBE9] shadow-sm flex flex-col md:flex-row gap-6 items-start justify-between">
            <div className="flex flex-col gap-3 max-w-md">
              <span className="p-2.5 bg-blue-50 rounded-lg text-primary w-min">
                <Brain className="w-6 h-6" />
              </span>
              <h2 className="text-lg font-bold text-[#1a1c1c]">Agentic Reasoning</h2>
              <p className="text-xs text-[#404752] leading-relaxed">
                Our AI agents don't just search code syntaxes; they understand logical developer intent. By scanning changesets across multiple repos, we output contextual risk audits.
              </p>
            </div>

            {/* Code diff illustration layout block */}
            <div className="w-full md:w-64 p-4 bg-gray-50 border border-[#EDEBE9] rounded-xl text-left shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-[#0078D4] font-mono mb-2 font-bold select-none">
                <FileCode className="w-4 h-4" />
                diff_analysis_engine.sh
              </div>
              <div className="space-y-1.5 font-mono text-[9px] text-gray-500">
                <p className="text-emerald-500">+ checkAuthenticationCredentials()</p>
                <p className="text-red-500">- logRawAuthTokensToConsole()</p>
                <div className="h-1 w-3/4 bg-gray-200 rounded"></div>
                <div className="h-1 w-full bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>

          {/* Feature Card 2: Automated Artifacts */}
          <div className="bg-white p-8 rounded-2xl border border-[#EDEBE9] shadow-sm flex flex-col md:flex-row gap-6 items-start justify-between">
            <div className="flex flex-col gap-3 max-w-md">
              <span className="p-2.5 bg-yellow-50 rounded-lg text-[#D83B01] w-min">
                <Scroll className="w-6 h-6" />
              </span>
              <h2 className="text-lg font-bold text-[#1a1c1c]">Automated Artifacts</h2>
              <p className="text-xs text-[#404752] leading-relaxed">
                Stop spending Friday afternoons manually drafting change registers. HERALD renders public-facing news logs and private teams telemetry packages immediately.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full md:w-64 shrink-0 font-sans select-none pb-1">
              <div className="p-3 bg-emerald-50/50 border border-[#107C10]/20 rounded-lg text-center flex flex-col items-center gap-1 shadow-sm">
                <CheckCircle className="w-5 h-5 text-[#107C10]" />
                <span className="text-[10px] font-bold text-[#107C10] uppercase tracking-wider">Changelogs</span>
              </div>
              <div className="p-3 bg-orange-50/50 border border-[#D83B01]/20 rounded-lg text-center flex flex-col items-center gap-1 shadow-sm">
                <FileCode className="w-5 h-5 text-[#D83B01]" />
                <span className="text-[10px] font-bold text-[#D83B01] uppercase tracking-wider">Tech Docs</span>
              </div>
            </div>
          </div>

          {/* Feature Card 3: Enterprise Actions */}
          <div className="bg-white p-8 rounded-2xl border border-[#EDEBE9] shadow-sm flex flex-col md:flex-row gap-6 items-start justify-between animate-fade-in">
            <div className="flex flex-col gap-3 max-w-md">
              <span className="p-2.5 bg-purple-50 rounded-lg text-[#9B30FF] w-min">
                <Zap className="w-6 h-6" />
              </span>
              <h2 className="text-lg font-bold text-[#1a1c1c]">Enterprise Actions</h2>
              <p className="text-xs text-[#404752] leading-relaxed">
                Close the deployment loop effortlessly. We publish documentation directly to Microsoft Teams clusters, SharePoint file systems, and Outlook distribution lists automatically.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 items-center justify-center p-4 bg-gray-50 border border-[#EDEBE9] rounded-xl w-full md:w-64 shrink-0 select-none">
              <span className="text-[10px] font-bold text-[#404752] bg-white border border-[#EDEBE9] px-2.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1 font-sans">
                <Users className="w-3.5 h-3.5 text-blue-500" /> Teams
              </span>
              <span className="text-[10px] font-bold text-[#404752] bg-white border border-[#EDEBE9] px-2.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1 font-sans">
                <FolderHeart className="w-3.5 h-3.5 text-emerald-500" /> folder
              </span>
              <span className="text-[10px] font-bold text-[#404752] bg-white border border-[#EDEBE9] px-2.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1 font-sans">
                <Mail className="w-3.5 h-3.5 text-orange-500" /> Outlook
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* Footer CTA Section */}
      <section className="px-6 py-16 text-center max-w-xl mx-auto">
        <h3 className="text-xl font-extrabold text-[#1a1c1c] mb-2 leading-tight">Ready to automate your release cycle?</h3>
        <p className="text-xs text-[#404752] mb-8 leading-normal font-sans">Join the world's most sophisticated and high-performing DevOps engineering teams today.</p>
        <button 
          onClick={onBackToApp}
          className="bg-primary hover:bg-[#0078D4] text-white font-bold text-xs uppercase tracking-wider py-3.5 px-8 rounded-xl shadow-md transition-transform duration-150 active:scale-95 cursor-pointer inline-block"
        >
          CONNECT RELEASE CONSOLE
        </button>
      </section>

    </div>
  );
}
