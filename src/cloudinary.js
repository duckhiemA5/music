const CLOUDINARY_NAME = "xjpwalss";
const UPLOAD_PRESET = "music_space_upload";

async function uploadToCloudinary(file, resourceType) {
    const formData = new FormData();

    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("folder", "music-space");

    const endpoint =
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/${resourceType}/upload`;

    const response = await fetch(endpoint, {
        method: "POST",
        body: formData
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error?.message || "Upload thất bại");
    }

    return result;
}

export async function uploadMusicToCloudinary(file) {
    const result = await uploadToCloudinary(file, "video");

    return {
        secure_url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        duration: result.duration || 0
    };
}

export async function uploadCoverToCloudinary(file) {
    const result = await uploadToCloudinary(file, "image");

    return {
        secure_url: result.secure_url,
        public_id: result.public_id
    };
}