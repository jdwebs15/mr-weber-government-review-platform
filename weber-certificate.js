(() => {
  const endpoint = 'https://script.google.com/macros/s/AKfycbxENUBm5pd966tRn1g9R7HH0zSXcEI10LGLivzQzN0pn6b0ytZHJdV8HU9i0ihYtHJW/exec';
  let shownRun;
  window.WeberRun = {
    finish(name, started, total, correct, attempts, finished = new Date()) {
      const start = new Date(started);
      const end = new Date(finished);
      if (!started || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
          !Number.isInteger(total) || total < 1 || total !== correct || attempts !== total) return false;
      const file = location.pathname.split('/').filter(Boolean).pop().replace(/\.html$/i, '');
      const title = document.title;
      const startedAt = start.toISOString();
      const endedAt = end.toISOString();
      const runId = window.WeberProgress?.runId() || file + '|' + startedAt;
      window.WeberProgress?.complete();
      const existing = document.getElementById('weber-run-dialog');
      if (shownRun === runId && existing) {
        if (!existing.open) existing.showModal();
        return true;
      }
      shownRun = runId;
      if (existing) existing.remove();
      const dialog = document.createElement('dialog');
      dialog.id = 'weber-run-dialog';
      dialog.setAttribute('aria-labelledby', 'weber-run-heading');
      dialog.innerHTML = `
        <form id="weber-run-form">
          <h2 id="weber-run-heading">100% Perfect Run</h2>
          <p class="weber-game"></p>
          <p>Enter your student information to record the run.</p>
          <label>Student name<input name="student" required autocomplete="name"></label>
          <label>School email<input name="email" type="email" required autocomplete="email"></label>
          <label>Class period<select name="period" required>
            <option value="">Choose your period</option>
            <option>1</option><option>2</option><option>3</option><option>4</option>
            <option>5</option><option>6</option><option>7</option><option>8</option>
          </select></label>
          <button type="submit">Create Certificate &amp; Save</button>
        </form>
        <section id="weber-certificate" hidden>
          <h2>100% Perfect Run</h2>
          <p class="weber-name"></p>
          <p class="weber-game"></p>
          <p class="weber-dates"></p>
        </section>
        <p id="weber-run-status" role="status"></p>
        <button type="button" id="weber-retry" hidden>Retry Sheet Save</button>
        <button type="button" id="weber-print" hidden>Print Certificate</button>
        <button type="button" id="weber-close">Close</button>`;
      document.body.append(dialog);
      dialog.querySelectorAll('.weber-game').forEach(el => el.textContent = title);
      const form = dialog.querySelector('form');
      const status = dialog.querySelector('#weber-run-status');
      const retry = dialog.querySelector('#weber-retry');
      const print = dialog.querySelector('#weber-print');
      form.elements.student.value = name === '—' ? '' : (name || '');
      const identity = window.WeberProgress?.identity();
      if (identity) {
        form.elements.student.value = identity.name;
        form.elements.email.value = identity.email;
        form.elements.period.value = identity.period;
        for (const field of [form.elements.student,form.elements.email,form.elements.period]) {
          if(field.tagName==='SELECT') field.disabled=true;
          else field.readOnly=true;
        }
      }
      let payload;
      async function save() {
        retry.hidden = true;
        status.textContent = 'Sending to the class Sheet…';
        try {
          await window.WeberProgress?.afterAutosave();
          const response = await fetch(endpoint, {
            method: 'POST', headers: {'Content-Type':'text/plain;charset=utf-8'},
            body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
          });
          if (!response.ok) throw new Error('Sheet request failed');
          const result = await response.json();
          if (result.ok !== true && result.success !== true) throw new Error('Sheet receipt unavailable');
          status.textContent = 'Recorded in the class Sheet.';
        } catch {
          status.textContent = 'Sheet receipt could not be confirmed. You can still print your certificate.';
          retry.hidden = false;
        }
      }
      form.addEventListener('submit', event => {
        event.preventDefault();
        const student = form.elements.student.value.trim();
        if (!student) { form.elements.student.focus(); return; }
        const email = form.elements.email.value.trim().toLowerCase();
        const period = form.elements.period.value;
        payload = {
          course:'Government', action:'submit', status:'submitted', eventType:'review_run_complete',
          assignmentKey:file, assignmentTitle:title, gameId:file, runId, startedAt,
          endedAt, completedAt:endedAt, updatedAt:endedAt, name:student, studentName:student,
          email, period, student:{name:student,email,period}, total, totalQuestions:total,
          score:correct, firstAttemptScore:correct, firstPassCorrect:correct,
          totalAttempts:attempts, wrongAttempts:0, answerCount:total, percent:100,
          elapsedSeconds:Math.max(0,Math.floor((end-start)/1000)), finalMasteryAchieved:true
        };
        dialog.querySelector('.weber-name').textContent = student;
        dialog.querySelector('.weber-dates').textContent =
          'Started ' + start.toLocaleString() + ' · Finished ' + end.toLocaleString();
        form.hidden = true;
        dialog.querySelector('#weber-certificate').hidden = false;
        print.hidden = false;
        save();
      });
      retry.onclick = save;
      print.onclick = () => window.print();
      const openButton = document.getElementById('weber-open-certificate') || document.createElement('button');
      openButton.id = 'weber-open-certificate';
      openButton.type = 'button';
      openButton.textContent = 'View Perfect Run Certificate';
      openButton.onclick = () => dialog.showModal();
      document.body.append(openButton);
      dialog.querySelector('#weber-close').onclick = () => dialog.close();
      dialog.showModal();
      return true;
    }
  };
})();
