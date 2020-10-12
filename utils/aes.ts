import crypto from "crypto";
const IV_LENGTH = 16;

export function encrypt (data, key) {
    let cipher = crypto.createCipher('aes-256-cbc', key);

    return Buffer.concat([cipher.update(data), cipher.final()]);
}
    
export function decrypt (data, key) {
    let cipher = crypto.createDecipher('aes-256-cbc', key);

    return Buffer.concat([cipher.update(data), cipher.final()]);
}

// export function encrypt(data, key) {
//     let iv = crypto.randomBytes(IV_LENGTH);
//     let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
//     let encrypted = cipher.update(data);
//     encrypted = Buffer.concat([encrypted, cipher.final()]);
//     return Buffer.from(iv.toString('hex') + ':' + encrypted.toString('hex'));
// }

// function decrypt(text) {
//     let textParts = text.split(':');
//     let iv = Buffer.from(textParts.shift(), 'hex');
//     let encryptedText = Buffer.from(textParts.join(':'), 'hex');
//     let decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
//     let decrypted = decipher.update(encryptedText);
//     decrypted = Buffer.concat([decrypted, decipher.final()]);
//     return decrypted.toString();
// }