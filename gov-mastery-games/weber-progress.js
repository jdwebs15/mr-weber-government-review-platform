(() => {
  const endpoint = 'https://script.google.com/macros/s/AKfycbxENUBm5pd966tRn1g9R7HH0zSXcEI10LGLivzQzN0pn6b0ytZHJdV8HU9i0ihYtHJW/exec';
  const assignmentKey = location.pathname.split('/').pop().replace(/\.html$/i, '');
  const namespace = 'weber-review-v2:' + location.pathname;
  let adapter, identity, run, lastState, gameStart, pending, sending, scheduled, committed, restoring, status, badge, dialog;
  const stringify = value => JSON.stringify(value, function (key, value) {
    const original = this[key];
    if (original instanceof Date) return {weberDate:original.toISOString()};
    if (original instanceof Set) return {weberSet:[...original]};
    return value;
  });
  const parse = text => JSON.parse(text, (_, v) => v?.weberDate ? new Date(v.weberDate) : v?.weberSet ? new Set(v.weberSet) : v);
  const read = key => { try { return parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, stringify(value)); return true; } catch { return false; } };
  const runKey = email => namespace + ':' + email;
  const label = message => { status.textContent = message; badge.textContent = message; };
  function snapshot() {
    if (!run || restoring) return;
    const data = adapter.snapshot();
    if (!data) return;
    const token = Number(new Date((typeof data.runStarted === "number" ? data.runStarted : null) ?? data.state?.startedAt ?? data.state?.startTime ?? data.session?.runStartedAt ??
      data.startedAt ?? data.startTimeMs ?? data.startTime ?? data.startTs ?? data.startMs ?? data.startStamp));
    if (Number.isFinite(token) && token > 0) {
      if (gameStart && gameStart !== token) {
        const startedAt = new Date(token).toISOString();
        run = {identity,assignmentKey,startedAt,id:assignmentKey+'|'+startedAt};
        lastState = null;
        committed = false;
      }
      gameStart = token;
    }
    if (committed) return;
    const encoded = stringify(data);
    if (encoded === lastState) return;
    lastState = encoded;
    run = {...run, snapshot:encoded, savedAt:new Date().toISOString()};
    const saved = write(runKey(identity.email), run);
    label(saved ? 'Saved on this device' : 'Device storage unavailable');
    pending = run;
    if (!scheduled && !sending) scheduled = setTimeout(flush, 1500);
  }
  async function flush() {
    clearTimeout(scheduled);
    scheduled = null;
    if (sending || !pending || committed) return;
    const checkpoint = pending;
    pending = null;
    sending = true;
    const student = checkpoint.identity;
    const record = {
      name:student.name, studentName:student.name, email:student.email, period:student.period, student,
      course:'Government', assignmentKey, assignmentTitle:document.title, gameId:assignmentKey,
      action:'save', status:'in_progress', eventType:'review_run_progress',
      runId:checkpoint.id, startedAt:checkpoint.startedAt, updatedAt:checkpoint.savedAt,
      basicsProgress:{...checkpoint,email:student.email,version:2}
    };
    try {
      const body = JSON.stringify(record);
      const response = await fetch(endpoint,{
        method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body,
        keepalive:new Blob([body]).size < 60000,signal:AbortSignal.timeout(12000)
      });
      const result = await response.json();
      if (!response.ok || (result.ok !== true && result.success !== true)) throw Error();
      if (run?.savedAt === checkpoint.savedAt && !committed) label('Saved to the class Sheet');
    } catch {
      if (!committed) {
        pending ||= checkpoint;
        label('Sheet sync unconfirmed. This device keeps the saved run.');
      }
    } finally {
      sending = false;
      if (pending && !committed) scheduled = setTimeout(flush, 10000);
    }
  }
  function valid(candidate, email) {
    return !!candidate && candidate.identity?.email === email && candidate.assignmentKey === assignmentKey &&
      candidate.snapshot && !candidate.completed;
  }
  function launch(student, checkpoint) {
    identity = student;
    write(namespace + ':identity', student);
    const startedAt = new Date().toISOString();
    run = checkpoint || {identity:student,assignmentKey,startedAt,id:assignmentKey+'|'+startedAt};
    lastState = null;
    gameStart = null;
    committed = false;
    if (checkpoint) {
      const elapsed = parse(checkpoint.snapshot);
      restoring = true;
      try {
        adapter.start(identity);
        adapter.restore(elapsed);
      } finally { restoring = false; }
    } else {
      adapter.start(identity);
    }
    dialog.close();
    snapshot();
  }
  async function findSaved(email) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({action:'load',course:'Government',assignmentKey,email});
    const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error();
    const result = await response.json();
    if (!result.ok) throw Error();
    if (result.payload?.assignmentKey !== assignmentKey) return null;
    return result.payload.basicsProgress;
  }
  function boot() {
    dialog = document.createElement('dialog');
    dialog.id = 'weber-sign-in';
    dialog.setAttribute('aria-labelledby','weber-sign-in-title');
    dialog.innerHTML = `
      <form>
        <h2 id="weber-sign-in-title">Student Sign-In</h2>
        <label>Full name<input name="studentName" autocomplete="name" required></label>
        <label>Class period<select name="period" required><option value="">Choose period</option>
        ${Array.from({length:8},(_,i)=>'<option>'+(i+1)+'</option>').join('')}</select></label>
        <label>School email<input name="email" type="email" autocomplete="email" required></label>
        <button type="submit">Start New Run</button>
        <button type="button" id="weber-load-run">Load Saved Run</button>
        <p role="status"></p>
      </form>`;
    document.body.append(dialog);
    badge = document.createElement('small');
    badge.className = 'weber-save-status';
    badge.setAttribute('role','status');
    document.body.append(badge);
    const form = dialog.querySelector('form');
    status = form.querySelector('[role="status"]');
    const load = form.querySelector('#weber-load-run');
    const remembered = read(namespace+':identity');
    if (remembered) {
      form.elements.studentName.value = remembered.name;
      form.elements.period.value = remembered.period;
      form.elements.email.value = remembered.email;
    }
    dialog.addEventListener('cancel',event=>event.preventDefault());
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (load.disabled || !form.reportValidity()) return;
      const student = {
        name:form.elements.studentName.value.trim(),
        period:form.elements.period.value,
        email:form.elements.email.value.trim().toLowerCase()
      };
      if (student.name.split(/\s+/).length < 2) {
        label('Enter your first and last name.');
        return;
      }
      if (valid(read(runKey(student.email)),student.email) &&
          !window.confirm('Replace your saved run with a new one?')) return;
      launch(student);
    });
    load.addEventListener('click',async () => {
      const field = form.elements.email;
      if (!field.reportValidity()) return;
      const email = field.value.trim().toLowerCase();
      load.disabled = true;
      label('Looking for your saved run…');
      const local = read(runKey(email));
      let cloud;
      try { cloud = await findSaved(email); } catch {}
      finally { load.disabled = false; }
      const found = [local,cloud].filter(x=>valid(x,email)).sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0];
      if (found) {
        try { launch(found.identity,found); }
        catch { label('This saved run could not be restored. Start a new run to continue.'); }
      } else label('No unfinished run could be retrieved for that email.');
    });
    const checkpoint = remembered && read(runKey(remembered.email));
    dialog.showModal();
    if (valid(checkpoint,remembered?.email)) {
      try { launch(checkpoint.identity,checkpoint); }
      catch { label('Your saved run could not be restored.'); }
    }
    document.addEventListener('click',()=>queueMicrotask(snapshot),true);
    document.addEventListener('keyup',()=>queueMicrotask(snapshot),true);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){ snapshot(); flush(); }
    });
    window.addEventListener('pagehide',()=>{ snapshot(); flush(); });
    setInterval(snapshot,350);
  }
  window.WeberProgress = {
    identity:()=>identity,
    runId:()=>run?.id,
    async afterAutosave() {
      while (sending) await new Promise(resolve=>setTimeout(resolve,50));
    },
    complete() {
      if (!identity || !run) return;
      committed = true;
      pending = null;
      clearTimeout(scheduled);
      write(runKey(identity.email),{...run,completed:true});
    },
    dataFields:obj=>Object.fromEntries(Object.entries(obj).filter(([key])=>!/(timer|interval)/i.test(key)||/seconds/i.test(key))),
    connect(config) {
      adapter = config;
      window.addEventListener('DOMContentLoaded',boot,{once:true});
    }
  };
})();
