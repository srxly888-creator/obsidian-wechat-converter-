function resolveSyncAccount({ accounts, selectedAccountId, defaultAccountId }) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (list.length === 0) return null;

  if (selectedAccountId) {
    const selected = list.find((account) => account.id === selectedAccountId);
    if (selected) return selected;
  }

  if (defaultAccountId) {
    const byDefault = list.find((account) => account.id === defaultAccountId);
    if (byDefault) return byDefault;
  }

  return list[0];
}

function toSyncFriendlyMessage(errorMessage = '') {
  if (errorMessage.includes('45002')) {
    return '文章太长，微信接口拒收。建议分篇发送，或使用插件顶部的「复制」按钮手动粘贴到公众号后台。';
  }
  return errorMessage;
}

module.exports = {
  resolveSyncAccount,
  toSyncFriendlyMessage,
};
