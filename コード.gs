// 1. LINEのチャネルアクセストークン
const LINE_TOKEN = 'ACCESS_TOKEN';
// 2. 送信先のID（グループIDなど）
const TO_ID = 'GROUP_ID';
// 3. 管理用ラベルの名前（Gmailにこの名前のラベルが自動で作られます）
const LABEL_NAME = 'LINE通知済み';

// ★ 何通以上なら「まとめ通知」にするかの設定
const BATCH_THRESHOLD = 3; 

function fetchAndNotify() {
  // ラベルを取得（なければ作成）
  const label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);

  // 【重要】もし既にラベルが付いているのに「未読」になったものがあれば、
  // 新しい返信が来た可能性があるため、一度ラベルを外して再通知の対象にします。
  const reNotifyThreads = GmailApp.search(`is:unread label:${LABEL_NAME}`);
  reNotifyThreads.forEach(t => t.removeLabel(label));

  // 検索条件：未読、受信トレイ、各種除外、かつ「通知済みラベルが付いていない」もの
  const query = `is:unread in:inbox -category:promotions -from:me -from:mailer-daemon -from:postmaster@tmu.ac.jp -from:no-reply@accounts.google.com -from:googleplay-noreply@google.com -from:google-gemini-noreply@google.com -label:${LABEL_NAME}`;
  const threads = GmailApp.search(query, 0, 15);
  
  if (threads.length === 0) return;

  if (threads.length < BATCH_THRESHOLD) {
    // 【個別通知】
    threads.forEach(thread => {
      const messages = thread.getMessages();
      const lastMessage = messages[messages.length - 1]; 
      if (lastMessage.isUnread()) {
        sendIndividualFlex(lastMessage);
        // 既読にする代わりにラベルを付ける
        label.addToThread(thread);
      }
    });
  } else {
    // 【まとめ通知】
    sendBatchedFlex(threads);
    // 既読にする代わりにラベルを付ける
    threads.forEach(thread => label.addToThread(thread));
  }
}

/**
 * 1. 個別通知用（詳細カード）
 */
function sendIndividualFlex(message) {
  const date = Utilities.formatDate(message.getDate(), 'JST', 'yyyy/MM/dd HH:mm');
  const subject = message.getSubject() || '(無題)';
  const from = message.getFrom();
  const body = message.getPlainBody().substring(0, 300);

  const flexContents = {
    "type": "bubble",
    "header": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "✉ 新着メール(個別)", "weight": "bold", "color": "#1DB446", "size": "sm" }] },
    "body": {
      "type": "box", "layout": "vertical", "contents": [
        { "type": "text", "text": subject, "weight": "bold", "size": "md", "wrap": true },
        { "type": "text", "text": "From: " + from, "size": "xs", "color": "#888888", "margin": "md", "wrap": true },
        { "type": "separator", "margin": "md" },
        { "type": "text", "text": body, "wrap": true, "size": "sm", "margin": "md" }
      ]
    }
  };
  postToLine(flexContents, "新着: " + subject);
}

/**
 * 2. まとめ通知用（リスト形式：本文100字付き）
 */
function sendBatchedFlex(threads) {
  const contents = [];
  threads.forEach(thread => {
    const msg = thread.getMessages()[thread.getMessages().length - 1];
    let body = msg.getPlainBody().replace(/\s+/g, ' ');
    if (body.length > 100) body = body.substring(0, 100) + '...';

    contents.push({
      "type": "box", "layout": "vertical", "margin": "md", "contents": [
        { "type": "text", "text": "● " + (msg.getSubject() || '(無題)'), "weight": "bold", "size": "sm", "wrap": true },
        { "type": "text", "text": "└ " + msg.getFrom(), "size": "xs", "color": "#888888", "wrap": true },
        { "type": "text", "text": body, "size": "xs", "color": "#555555", "wrap": true, "margin": "sm", "maxLines": 3 }
      ]
    });
    contents.push({ "type": "separator", "margin": "md" });
  });
  
  if (contents.length > 0) contents.pop();

  const flexContents = {
    "type": "bubble",
    "header": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": `📦 まとめ通知 (${threads.length}件)`, "weight": "bold", "color": "#1DB446" }] },
    "body": { "type": "box", "layout": "vertical", "contents": contents }
  };
  postToLine(flexContents, `${threads.length}件のメールが届いています`);
}

/**
 * LINE API送信
 */
function postToLine(flexJson, altText) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = { 'to': TO_ID, 'messages': [{ 'type': 'flex', 'altText': altText, 'contents': flexJson }] };
  UrlFetchApp.fetch(url, {
    'method': 'post',
    'headers': { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
    'payload': JSON.stringify(payload)
  });
}
