
/**
 * Google Drive API Service
 * Handles folder creation and PDF upload to user's Drive.
 */

export const uploadToGoogleDrive = async (
  accessToken: string,
  folderName: string,
  fileName: string,
  blob: Blob
) => {
  try {
    // 1. Find or Create the folder
    let folderId = await findFolder(accessToken, folderName);
    if (!folderId) {
      folderId = await createFolder(accessToken, folderName);
    }

    if (!folderId) throw new Error("Could not establish Drive folder protocol.");

    // 2. Upload the file
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/pdf'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: form
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Drive Upload Error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Drive Sync Exception:", err);
    return false;
  }
};

const findFolder = async (accessToken: string, name: string): Promise<string | null> => {
  const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
};

const createFolder = async (accessToken: string, name: string): Promise<string | null> => {
  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  const data = await response.json();
  return data.id || null;
};
