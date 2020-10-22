const Axios = require("axios")
const fs = require('fs')
const PNG = require("pngjs").PNG;
const imgConvert = require('image-convert');

export async function hideInImageURL (data, url = "https://picsum.photos/800.jpg") {
    const file = await downloadImage(url);
    return hide(file, data);
}

function downloadImage (url) {  
    return new Promise ((resolve, reject) => imgConvert.fromURL({
        url,
        output_format:"png"
    },function(err,buffer,file){
        if (err) reject(err)
        else resolve(buffer)
    }));
}

function hide (recipient, data) {
    const { width, height, data: rawData } = PNG.sync.read(recipient);
    
    const length = [
        (data.length & 0xFF0000) >> 24, 
        (data.length & 0x00FF0000) >> 16,
        (data.length & 0x0000FF00) >> 8,
        (data.length & 0x000000FF)
    ];
    
    const binaryData = [ ...length,  ...data ].map(b => b.toString(2).padStart(8, "0")).join("");

    for (let i=0;i<binaryData.length;i++) {
        const bit = rawData[i] & 1;
        const bitToHide = +binaryData[i];
        const c = rawData[i];

        if(bit === bitToHide) continue;
        if(bitToHide === 0) {
            if(rawData[i] === 255) rawData[i] = 254;
            else rawData[i] += (Math.random() > 0.5? 1 : -1)
        } else if (bitToHide === 1) {
            if(rawData[i] === 0) rawData[i] = 1;
            else rawData[i] += (Math.random() > 0.5? 1 : -1)
        }
    }

    return PNG.sync.write({
        width,
        height,
        data: rawData
    });
}

export function reveal (recipient) {
    const { width, height, data: rawData } = PNG.sync.read(recipient);
    let binaryData = "";

    for (let i=0;i<4*8;i++) {
        binaryData += rawData[i] & 1;
    }

    let buf = binaryToBuffer(binaryData);
    let length = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];

    for (let i=0;i<length * 8;i++) {
        binaryData += rawData[i + 4*8] & 1;
    }

    buf = binaryToBuffer(binaryData);

    return buf.slice(4);
}

function binaryToBuffer (binaryData) {
    const hiddenData = new Uint8Array(Math.ceil(binaryData.length/8))

    for(let i=0;i<hiddenData.length;i++) {
        hiddenData[i] = parseInt(binaryData.substr(i * 8, 8).padStart(8, "0"), 2);
    }

    return Buffer.from(hiddenData);
}