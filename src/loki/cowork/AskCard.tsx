// THE QUESTION, ASKED OF THE PERSON (RFC 0007 §17.6): the engine's own prompt hook found something to settle in what was typed (a named file that is not there) and is waiting.
// This is the floating card over that pane: answers as chips (the first is the default), "answer later" for one that can wait. Continue hands the choices back to the hook, which
// gives them to the model with the prompt; the X or Escape says "ask nothing". It is never a modal: the terminal keeps the keyboard. Closing it any way answers it, so the agent
// never waits on a card nobody can see.
import * as React from "react";
import { answerAsk, type OpenAsk } from "./api";
import { reduce, type State } from "./precheck";
import { PreCheckCard } from "./PreCheckCard";

export function AskCard({ ask, onDone }: { ask: OpenAsk; onDone?: () => void }) {
  const [state, dispatch] = React.useReducer(reduce, { phase: "ready", text: ask.text, verdict: ask.verdict, answers: {}, deferred: [] } as State);
  const [gone, setGone] = React.useState(false);
  const sent = React.useRef(false);
  const finish = React.useCallback((answers: Record<string, string>, skip: boolean) => {
    if (sent.current) return; sent.current = true; setGone(true);
    void answerAsk(ask.id, answers, skip).then(() => onDone?.());
  }, [ask.id, onDone]);
  // dismissed with the X or Escape: the reducer goes idle; tell the hook so it stops waiting
  React.useEffect(() => { if (state.phase === "idle") finish({}, true); }, [state.phase, finish]);
  if (gone || state.phase !== "ready") return null;
  return <PreCheckCard state={state} tier="deterministic" ms={null} dispatch={dispatch} onSend={() => finish(state.answers, false)} sendLabel="Continue" where="the agent is waiting for you" />;
}
