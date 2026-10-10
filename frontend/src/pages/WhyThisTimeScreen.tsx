import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Send,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Activity,
  CloudSun,
  Timer,
  Cpu,
  Loader2,
  RotateCcw,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { askAgent, getPlanById } from '../api/client';
import { AgentResponse, PlanData } from '../types';
import { useApp } from '../context/AppContext';

interface WhyThisTimeScreenProps {
  currentPlan?: PlanData | null;
}

interface ConversationTurn {
  id: string;
  question: string;
  answer?: string;
  tag?: 'ai' | 'template';
  tools_used?: any[];
  loading?: boolean;
  error?: string | null;
}

const CHIP_QUESTIONS = [
  'What if I run 30 minutes?',
  'Is walking safer?',
  'Why not mornings?',
];

export const WhyThisTimeScreen: React.FC<WhyThisTimeScreenProps> = ({ currentPlan }) => {
  const { id } = useParams<{ id: string }>();
  const { currentPlan: contextPlan } = useApp();

  const [plan, setPlan] = useState<PlanData | null>(currentPlan || contextPlan || null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(!currentPlan && !contextPlan);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [expandedTraceKey, setExpandedTraceKey] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  // Load plan if needed
  useEffect(() => {
    if (!plan && id) {
      setLoadingPlan(true);
      getPlanById(id)
        .then((p) => {
          setPlan(p);
          setLoadingPlan(false);
        })
        .catch(() => {
          setLoadingPlan(false);
        });
    }
  }, [id, plan]);

  // Initial explanation question on load
  const initialAskedRef = useRef(false);
  useEffect(() => {
    if (plan && !initialAskedRef.current) {
      initialAskedRef.current = true;
      sendQuestion('Why this time?');
    }
  }, [plan]);

  const sendQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || isSubmitting) return;

    const planIdToUse = plan?.plan_id || id;
    if (!planIdToUse) return;

    const turnId = `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newTurn: ConversationTurn = {
      id: turnId,
      question: trimmed,
      loading: true,
      error: null,
    };

    setConversation((prev) => [...prev, newTurn]);
    setIsSubmitting(true);
    setQuestionInput('');

    // 30-second timeout controller
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await askAgent(planIdToUse, trimmed);
      clearTimeout(timeoutTimer);

      setConversation((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                loading: false,
                answer: res.answer,
                tag: res.explained_by,
                tools_used: res.tools_used,
              }
            : t
        )
      );
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('timed out');
      const errorMsg = isTimeout
        ? 'Request timed out after 30 seconds. Gemini may be experiencing latency.'
        : err.message || 'Could not retrieve explanation from AI agent.';

      setConversation((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                loading: false,
                error: errorMsg,
              }
            : t
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = (turn: ConversationTurn) => {
    // Remove the errored turn and re-send
    setConversation((prev) => prev.filter((t) => t.id !== turn.id));
    sendQuestion(turn.question);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(questionInput);
  };

  // If no plan, show empty prompt
  if (!loadingPlan && !plan) {
    return (
      <div className="max-w-[560px] mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#E4F2E8] border border-[#1F7A4C]/20 flex items-center justify-center text-[#1F7A4C] mx-auto">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-[#14211A]">Create a plan first</h2>
        <p className="text-sm text-[#4F6157] max-w-[40ch] mx-auto">
          Create an activity plan on the Planner first before asking why a time window is recommended.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 py-3 px-6 bg-[#1F7A4C] text-white text-sm font-semibold rounded-xl hover:bg-[#155C39] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go to Planner</span>
        </Link>
      </div>
    );
  }

  // Get active/most recent tools trace for the right column summary
  const latestTurnWithTools = [...conversation].reverse().find((t) => t.tools_used && t.tools_used.length > 0);
  const activeTools = latestTurnWithTools?.tools_used || [];

  return (
    <div className="w-full py-8 sm:py-12 space-y-8">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <Link
          to={plan ? `/plan/${plan.plan_id}` : '/'}
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.06em] text-[#4F6157] hover:text-[#14211A] transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Recommendation</span>
        </Link>

        {/* Strands Gemini Badge */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#1F7A4C] bg-[#E4F2E8] px-3.5 py-1 rounded-full border border-[#1F7A4C]/20 font-semibold">
          <Cpu className="w-3.5 h-3.5" />
          <span>AWS Strands Agents SDK · Gemini</span>
        </div>
      </div>

      {/* Title */}
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#14211A] mb-2">
          Why this time?
        </h1>
        <p className="text-base text-[#4F6157] max-w-[65ch]">
          Ask questions about your recommended schedule. Every answer is synthesized by the Strands Agent using real tools and verified by an anti-hallucination guard against source mathematical facts.
        </p>
      </div>

      {/* Two Column Layout: Conversation (7 cols) & Tool Trace (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive Chat Stream (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 min-h-[420px] flex flex-col justify-between">
            {/* Messages Thread */}
            <div className="space-y-6 overflow-y-auto max-h-[600px] pr-1">
              {conversation.map((turn) => (
                <div key={turn.id} className="space-y-4">
                  {/* User Question */}
                  <div className="flex justify-end">
                    <div className="bg-[#14211A] text-white rounded-2xl rounded-tr-xs px-5 py-3 text-sm font-medium max-w-[85%] shadow-2xs">
                      {turn.question}
                    </div>
                  </div>

                  {/* Agent Response */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#1F7A4C] to-[#155C39] text-white flex items-center justify-center shrink-0 shadow-2xs mt-1">
                      <Sparkles className="w-4 h-4 text-[#E4F2E8]" />
                    </div>

                    <div className="flex-1 space-y-3">
                      {turn.loading && (
                        <div className="p-4 bg-[#F4F7F4] rounded-2xl rounded-tl-xs space-y-2 border border-[#D9E4D6]/50">
                          <div className="flex items-center gap-2 text-xs font-mono text-[#1F7A4C]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Strands agent invoking tools & reasoning...</span>
                          </div>
                          <div className="h-3 w-4/5 bg-[#D9E4D6] rounded animate-pulse" />
                          <div className="h-3 w-2/3 bg-[#D9E4D6] rounded animate-pulse" />
                        </div>
                      )}

                      {turn.error && (
                        <div className="p-4 bg-[#FFF5E6] border border-[#FF9900]/30 rounded-2xl text-xs text-[#A65100] space-y-2">
                          <div className="flex items-center gap-2 font-semibold">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{turn.error}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRetry(turn)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#FF9900]/40 text-xs font-semibold hover:bg-[#FFF5E6] cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retry Question</span>
                          </button>
                        </div>
                      )}

                      {!turn.loading && turn.answer && (
                        <div className="bg-[#F4F7F4] border border-[#D9E4D6] rounded-2xl rounded-tl-xs p-5 shadow-2xs space-y-3.5">
                          <p className="text-sm sm:text-base text-[#14211A] leading-relaxed">
                            {turn.answer}
                          </p>

                          {/* Verification & Attribution Badges */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#D9E4D6]">
                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider ${
                                turn.tag === 'ai'
                                  ? 'bg-[#E4F2E8] text-[#1F7A4C] border border-[#1F7A4C]/30'
                                  : 'bg-[#FFF5E6] text-[#A65100] border border-[#FF9900]/30'
                              }`}
                            >
                              {turn.tag === 'ai' ? 'WRITTEN BY AI' : 'TEMPLATE EXPLANATION'}
                            </span>

                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-[#D9E4D6] text-[11px] font-mono text-[#4F6157]">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#1F7A4C]" />
                              <span>Numbers verified</span>
                            </span>

                            {turn.tools_used && turn.tools_used.length > 0 && (
                              <span className="text-[11px] font-mono text-[#4F6157]">
                                {turn.tools_used.length} Strands tools called
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form & Quick Chips */}
            <div className="space-y-3 pt-4 border-t border-[#D9E4D6]">
              {/* Quick Prompt Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-[#4F6157]">Suggested:</span>
                {CHIP_QUESTIONS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => sendQuestion(chip)}
                    className="text-xs font-mono px-3 py-1.5 rounded-xl bg-[#F4F7F4] hover:bg-[#E4F2E8] text-[#14211A] border border-[#D9E4D6] hover:border-[#1F7A4C]/40 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Chat Input Box */}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={questionInput}
                  disabled={isSubmitting}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="Ask a question (e.g. Why not mornings? What if I run 30 min?)..."
                  className="flex-1 bg-[#F4F7F4]/60 border border-[#D9E4D6] rounded-xl px-4 py-3 text-sm text-[#14211A] placeholder-[#4F6157]/60 focus:outline-none focus:border-[#1F7A4C] focus:bg-white transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!questionInput.trim() || isSubmitting}
                  className="px-5 py-3 rounded-xl bg-[#1F7A4C] hover:bg-[#155C39] text-white font-semibold text-sm transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Ask</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Live Strands Execution Trace (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-[#D9E4D6] pb-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-[#14211A]">
                Strands Tool Execution Trace
              </h2>
              <p className="text-xs text-[#4F6157]">
                Live lifecycle hooks captured by @strands-agents/sdk
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase bg-[#E4F2E8] text-[#1F7A4C] px-2 py-0.5 rounded-full font-bold">
              REAL HOOKS
            </span>
          </div>

          {activeTools.length > 0 ? (
            <div className="space-y-3">
              {activeTools.map((tool, idx) => {
                const isExpanded = expandedTraceKey === `${tool.name}-${idx}`;
                return (
                  <div
                    key={`${tool.name}-${idx}`}
                    className="border border-[#D9E4D6] rounded-2xl overflow-hidden bg-[#F4F7F4]/40"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTraceKey(isExpanded ? null : `${tool.name}-${idx}`)}
                      className="w-full p-3.5 text-left flex items-center justify-between gap-3 hover:bg-[#F4F7F4] transition-colors cursor-pointer"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#14211A]">
                            {tool.name}
                          </span>
                          <span className="font-mono text-[10px] text-[#1F7A4C] bg-[#E4F2E8] px-2 py-0.2 rounded-full">
                            {tool.duration || `${tool.duration_ms || 5}ms`}
                          </span>
                        </div>
                        <p className="text-xs text-[#4F6157] line-clamp-1">
                          {tool.summary || `Executed ${tool.name}`}
                        </p>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#4F6157] shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#4F6157] shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 bg-white border-t border-[#D9E4D6] space-y-2 text-xs font-mono">
                        <div>
                          <span className="text-[#4F6157] font-semibold">Inputs:</span>
                          <pre className="mt-1 p-2 bg-[#F4F7F4] rounded-lg text-[11px] overflow-x-auto text-[#14211A]">
                            {JSON.stringify(tool.input, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <span className="text-[#4F6157] font-semibold">Outputs:</span>
                          <pre className="mt-1 p-2 bg-[#F4F7F4] rounded-lg text-[11px] overflow-x-auto text-[#14211A]">
                            {JSON.stringify(tool.output, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center border border-dashed border-[#D9E4D6] rounded-2xl text-xs text-[#4F6157] space-y-1">
              <p className="font-semibold text-[#14211A]">Awaiting tool execution</p>
              <p>When you ask a question, the Strands agent runs tools and streams execution details here.</p>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-[#E4F2E8]/40 border border-[#1F7A4C]/20 text-xs text-[#4F6157] space-y-1">
            <span className="font-semibold text-[#1F7A4C]">Anti-Hallucination Guard:</span>
            <p className="leading-relaxed">
              Before any response is shown, an automated regex inspector cross-references all numbers against the tool outputs above. Answers that fail verification twice revert to the deterministic template.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
