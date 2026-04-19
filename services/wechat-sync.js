function replaceUnuploadedDraftImagesWithPlaceholders(html) {
  if (typeof document === 'undefined') {
    return { html, imageSources: [] };
  }

  const div = document.createElement('div');
  div.innerHTML = html || '';
  const imageSources = [];

  Array.from(div.querySelectorAll('img')).forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    const isWechatImage = /^https?:\/\/mmbiz\.qpic\.cn\//i.test(src)
        || /^https?:\/\/mmbiz\.qlogo\.cn\//i.test(src);
    if (src && isWechatImage) return;

    imageSources.push(src);
    const placeholder = document.createElement('p');
    placeholder.setAttribute('style', 'margin:12px 0;padding:10px 12px;border:1px dashed #d0d7de;border-radius:6px;color:#8c6d1f;background:#fff8e5;font-size:13px;line-height:1.7;');
    placeholder.textContent = src
      ? `图片未同步，请在微信后台手动补传：${src}`
      : '图片未同步，请在微信后台手动补传。';
    img.replaceWith(placeholder);
  });

  return {
    html: div.innerHTML,
    imageSources,
  };
}

function createWechatSyncService(deps) {
  const {
    createApi,
    srcToBlob,
    processAllImages,
    processMathFormulas,
    prepareHtmlForDraft = async (html) => html,
    cleanHtmlForDraft,
    cleanupConfiguredDirectory,
    getFirstImageFromArticle,
  } = deps;

  return {
    async syncToDraft({
      account,
      proxyUrl,
      currentHtml,
      activeFile,
      publishMeta,
      sessionCoverBase64,
      sessionDigest,
      onStatus,
      onImageProgress,
      onMathProgress,
    }) {
      const api = createApi(account.appId, account.appSecret, proxyUrl);
      const imageUploadFailures = [];

      if (onStatus) onStatus('cover');
      const coverSrc = sessionCoverBase64 || publishMeta.coverSrc || getFirstImageFromArticle();
      if (!coverSrc) {
        throw new Error('未设置封面图，同步失败。请在弹窗中上传封面。');
      }

      const coverBlob = await srcToBlob(coverSrc);
      const coverRes = await api.uploadCover(coverBlob);
      const thumbMediaId = coverRes.media_id;

      let draftHtml = await prepareHtmlForDraft(currentHtml);

      if (onStatus) onStatus('images');
      let processedHtml = await processAllImages(draftHtml, api, (current, total) => {
        if (onImageProgress) onImageProgress(current, total);
      }, {
        accountId: account.id || '',
        onImageFailure: (failures) => {
          if (Array.isArray(failures)) imageUploadFailures.push(...failures);
        },
      });

      if (processedHtml.includes('mjx-container') || processedHtml.includes('<svg')) {
        if (onStatus) onStatus('math');
        processedHtml = await processMathFormulas(processedHtml, api, (current, total) => {
          if (onMathProgress) onMathProgress(current, total);
        });
      }

      const cleanedResult = replaceUnuploadedDraftImagesWithPlaceholders(cleanHtmlForDraft(processedHtml));
      const cleanedHtml = cleanedResult.html;

      const title = activeFile ? activeFile.basename : '无标题文章';
      const article = {
        title: title.substring(0, 64),
        content: cleanedHtml,
        thumb_media_id: thumbMediaId,
        author: account.author || '',
        digest: sessionDigest || '一键同步自 Obsidian',
      };
      const contentSourceUrl = String(account.contentSourceUrl || '').trim();
      if (contentSourceUrl) {
        article.content_source_url = contentSourceUrl;
      }
      if (typeof account.openComment === 'boolean') {
        article.need_open_comment = account.openComment ? 1 : 0;
      }
      if (typeof account.onlyFansCanComment === 'boolean') {
        article.only_fans_can_comment = account.onlyFansCanComment ? 1 : 0;
      }

      if (onStatus) onStatus('draft');
      await api.createDraft(article);
      const cleanupResult = await cleanupConfiguredDirectory(activeFile);

      return {
        article,
        cleanupResult,
        imageUploadFailures,
        placeholderImageSources: cleanedResult.imageSources,
      };
    },
  };
}

module.exports = {
  replaceUnuploadedDraftImagesWithPlaceholders,
  createWechatSyncService,
};
