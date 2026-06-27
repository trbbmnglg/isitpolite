  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 5: QUIZ MODE
  // ═══════════════════════════════════════════════════════════════════════
  async function handleQuizStart() {
    if (!localStorage.getItem(PRIVACY_KEY)) { privacyModal.classList.remove('hidden'); return; }

    var country = quizCountryEl.value;
    if (!country) { quizCountryEl.classList.add('field-error'); quizCountryEl.focus(); return; }
    quizCountryEl.classList.remove('field-error');

    quizStartBtn.disabled = true;
    quizStartBtn.textContent = 'Building quiz…';
    quizArea.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Generating your ' + sanitize(country) + ' quiz…</p></div>';

    try {
      var data = await callLookup('quiz', { country: country });
      initQuiz(data, country);
    } catch (err) {
      quizArea.innerHTML = '<div class="error-card" role="alert"><p class="error-icon" aria-hidden="true">⚠️</p><p class="error-message">' + sanitize(err.message) + '</p></div>';
    } finally {
      quizStartBtn.disabled = false;
      quizStartBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Quiz';
    }
  }


  function initQuiz(data, country) {
    quizState = { questions: data.questions || [], current: 0, score: 0, country: country, answers: [] };
    if (quizState.questions.length === 0) {
      quizArea.innerHTML = '<div class="error-card" role="alert"><p class="error-message">No questions were generated. Please try again.</p></div>';
      return;
    }
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    var q   = quizState.questions[quizState.current];
    var pct = (quizState.current / quizState.questions.length) * 100;

    var optsHtml = q.options.map(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      return '<button class="quiz-option" type="button" data-index="' + i + '"><span class="quiz-opt-letter">' + letter + '</span>' + sanitize(opt) + '</button>';
    }).join('');

    quizArea.innerHTML =
      '<div class="quiz-card">' +
        '<div class="quiz-progress-wrap"><div class="quiz-progress-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="quiz-meta">' +
          '<span class="quiz-counter">Question ' + (quizState.current + 1) + ' of ' + quizState.questions.length + '</span>' +
          '<span class="quiz-country-tag">' + sanitize(quizState.country) + '</span>' +
        '</div>' +
        '<h3 class="quiz-question">' + sanitize(q.question) + '</h3>' +
        '<div class="quiz-options">' + optsHtml + '</div>' +
      '</div>';

    quizArea.querySelectorAll('.quiz-option').forEach(function (btn) {
      btn.addEventListener('click', function () { handleQuizAnswer(parseInt(btn.dataset.index, 10)); });
    });
  }

  function handleQuizAnswer(selected) {
    var q         = quizState.questions[quizState.current];
    var correct   = Number(q.correct);   // model sometimes returns the index as a string
    var isCorrect = selected === correct;
    if (isCorrect) quizState.score++;
    quizState.answers.push({ selected: selected, correct: correct, isCorrect: isCorrect });

    // Highlight options
    quizArea.querySelectorAll('.quiz-option').forEach(function (btn, i) {
      btn.disabled = true;
      if (i === correct) btn.classList.add('correct');
      else if (i === selected && !isCorrect) btn.classList.add('wrong');
    });

    // Append explanation
    var card = quizArea.querySelector('.quiz-card');
    var expDiv = document.createElement('div');
    expDiv.className = 'quiz-explanation ' + (isCorrect ? 'correct' : 'wrong');
    expDiv.innerHTML =
      '<p class="quiz-exp-verdict">' + (isCorrect ? 'Correct!' : 'Not quite.') + '</p>' +
      '<p>' + sanitize(q.explanation) + '</p>';
    card.appendChild(expDiv);

    // Next / Results button
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-cta quiz-next-btn';

    if (quizState.current < quizState.questions.length - 1) {
      nextBtn.textContent = 'Next Question';
      nextBtn.addEventListener('click', function () {
        quizState.current++;
        renderQuizQuestion();
      });
    } else {
      nextBtn.textContent = 'See My Results';
      nextBtn.addEventListener('click', showQuizScore);
    }
    card.appendChild(nextBtn);
  }

  function showQuizScore() {
    var total = quizState.questions.length;
    var score = quizState.score;
    var pct   = Math.round((score / total) * 100);

    var msg, ringColor;
    if (pct === 100)     { msg = 'Perfect score! Cultural master.'; ringColor = 'var(--polite)'; }
    else if (pct >= 80)  { msg = 'Excellent! You know your customs.'; ringColor = 'var(--polite)'; }
    else if (pct >= 60)  { msg = 'Good effort! A bit more to learn.'; ringColor = 'var(--caution)'; }
    else                 { msg = 'Keep exploring — you\'ll get there!'; ringColor = 'var(--rude)'; }

    var rowsHtml = quizState.questions.map(function (q, i) {
      var ans = quizState.answers[i];
      return '<div class="score-row">' +
        '<span class="score-row-q">' + sanitize(q.question.substring(0, 70)) + (q.question.length > 70 ? '…' : '') + '</span>' +
        '<span class="score-row-r ' + (ans.isCorrect ? 'win' : 'loss') + '">' + (ans.isCorrect ? 'Correct' : 'Wrong') + '</span>' +
      '</div>';
    }).join('');

    quizArea.innerHTML =
      '<div class="quiz-score-card">' +
        '<div class="score-ring" style="border-color:' + ringColor + '">' +
          '<span class="score-number" style="color:' + ringColor + '">' + score + '/' + total + '</span>' +
        '</div>' +
        '<h3 class="score-msg">' + sanitize(msg) + '</h3>' +
        '<p class="score-sub">You answered ' + score + ' out of ' + total + ' questions correctly about <strong>' + sanitize(quizState.country) + '</strong>.</p>' +
        '<div class="score-breakdown">' + rowsHtml + '</div>' +
        '<button class="btn-cta" type="button" id="quiz-restart">Play Again</button>' +
      '</div>';

    document.getElementById('quiz-restart').addEventListener('click', function () {
      quizArea.innerHTML = '';
      quizStartBtn.disabled = false;
    });

    // Premium CTA — certificate for passing score (≥4/5).
    // Also add Scenario Coach button.
    if (score >= 4) {
      var scoreCard = quizArea.querySelector('.quiz-score-card');
      if (scoreCard) {
        addPremiumButton(scoreCard, 'Download Etiquette Certificate', 'certificate', {
          country: quizState.country,
          score: score,
          totalQuestions: total,
          answers: quizState.answers.map(function (a) { return a.selected; }),
          questions: quizState.questions,
        });
      }
    }
  }

