import { AbstractCommandModule, Message, OutgoingMessage, AzureStorage, ContextualizableModuleConfiguration } from "botyo-api";
import { BlobServiceClient, ContainerClient, BlobClient, ContainerListBlobsOptions, BlobItem } from "@azure/storage-blob";
import { inject } from "inversify";
import fs = require('fs');
import path = require('path');
import * as delay from "delay";
import * as YAML from "js-yaml";
import * as intoStream from 'into-stream';
import { Readable } from "stream";

export default class MemeCommand extends AbstractCommandModule {
    private memes: any;
    private initialised: boolean = false;
    private config: ContextualizableModuleConfiguration;

    constructor(@inject(AzureStorage.SYMBOL) private readonly azureStorage: BlobServiceClient) {
        super();
        this.config = this.getRuntime().getConfiguration();
        this.initialise();
        if (this.azureStorage == null) {
            throw new Error("AzureStorage is null");
        }
    }

    get attachmentsDir(): string {
        return path.join("attachments");
    }

    async getMemeConfig() {
        const containerName: string = this.config.getProperty<string>(MemeCommand.CONFIG_AZURE_CONTAINER_NAME);
        const listFileName: string = this.config.getProperty<string>(MemeCommand.CONFIG_AZURE_LIST_FILE_NAME);
        const container: ContainerClient = this.azureStorage.getContainerClient(containerName);
        const memeConfigBlob: BlobClient = container.getBlobClient(listFileName);
        const memeConfigRawBuffer = await memeConfigBlob.downloadToBuffer();
        if (!memeConfigRawBuffer.byteLength) {
            this.getRuntime().getLogger().info("Could not get memes config. Retrying...");
            await delay(30 * 1000);
            await this.getMemeConfig();
            return;
        }
        this.memes = YAML.load(memeConfigRawBuffer.toString('utf8')) as object;
    }

    async getFileStream(path: string): Promise<NodeJS.ReadableStream | null> {
        const containerName: string = this.config.getProperty<string>(MemeCommand.CONFIG_AZURE_CONTAINER_NAME);
        const container: ContainerClient = this.azureStorage.getContainerClient(containerName);
        const fileBlob: BlobClient = container.getBlobClient(path);
        if (!(await fileBlob.exists())) {
            return null;
        }
        let reponse = await fileBlob.download();
        if (!reponse.readableStreamBody) {
            return null;
        }
        return reponse.readableStreamBody;
    }

    async getRandomInDirectoryFileStream(dirPath: string): Promise<{ stream: NodeJS.ReadableStream, newPath: string } | null> {
        const containerName: string = this.config.getProperty<string>(MemeCommand.CONFIG_AZURE_CONTAINER_NAME);
        const container: ContainerClient = this.azureStorage.getContainerClient(containerName);
        let blobs: BlobItem[] = [];
        for await (const blob of container.listBlobsFlat({ prefix: dirPath.replace("\\", "/") })) {
            blobs.push(blob);
        }
        if (!blobs.length) {
            return null;
        }
        let randomBlob: BlobItem = blobs[Math.floor(Math.random() * blobs.length)];
        const fileBlob: BlobClient = container.getBlobClient(randomBlob.name);
        if (!(await fileBlob.exists())) {
            return null;
        }
        let reponse = await fileBlob.download();
        if (!reponse.readableStreamBody) {
            return null;
        }
        return {
            stream: reponse.readableStreamBody, newPath: path.join(dirPath, randomBlob.name)
        };
    }

    async initialise() {
        this.initialised = false;

        await this.getMemeConfig();

        this.initialised = true;
    }

    getCommand(): string {
        return "meme";
    }

    getDescription(): string {
        return "Wysyla zaleski mem";
    }

    getUsage(): string {
        return "<nazwa mema lub folder>, wpisz #meme list zeby zobaczyc liste memow lub #meme rnd zeby wyslac losowy mem";
    }

    validate(msg: Message, args: string): boolean {
        if (!args) {
            return false;
        }

        if (args === "list" || args === "update" || args === "rnd") {
            return true;
        }

        if (!this.checkMemeValid(this.memes, args)) {
            return false;
        }

        return true;
    }

    async execute(msg: Message, args: string): Promise<any> {
        if (!this.initialised) {
            return this.getRuntime().getChatApi().sendMessage(msg.threadID, "Ladowanie bota w trakcie...");
        }
        if (args === "list") {
            return this.getRuntime().getChatApi().sendMessage(msg.threadID, this.buildMemeList(this.memes, 0));
        }
        else if (args === "update") {
            return this.initialise();
        }

        let isRandom: boolean = args === "rnd";

        let attachmentPath: string = isRandom ? "" : this.buildMemePath(args);
        let attachmmentOldStream: NodeJS.ReadableStream | null | undefined;

        if (isRandom || this.checkMemeIsDir(this.memes, args)) {
            let result = await this.getRandomInDirectoryFileStream(attachmentPath);
            if (result) {
                attachmmentOldStream = result.stream;
                attachmentPath = result.newPath;
            }
        } else {
            attachmmentOldStream = await this.getFileStream(attachmentPath);
        }
        if (!attachmmentOldStream) {
            return this.getRuntime().getChatApi().sendMessage(msg.threadID, "Error occured: " + attachmentPath + " not available");
        }
        let attachmmentStream = new Readable().wrap(attachmmentOldStream);

        //DO NOT REMOVE: hack to provide filetype, the message will fail to upload without this
        (attachmmentStream as any).path = path.basename(attachmentPath);

        let message: OutgoingMessage = {
            attachment: attachmmentStream
        }

        return this.getRuntime().getChatApi().sendMessage(msg.threadID, message);
    }

    private checkMemeValid(memeDict: any, memePath: string): boolean {
        const memePathSplitted = memePath.split(" ", 2).filter(Boolean);
        if (memePathSplitted.length == 2) {
            if (memeDict[memePathSplitted[0]] != null) {
                return this.checkMemeValid(memeDict[memePathSplitted[0]], memePathSplitted[1]);
            }
        }
        else if (memePathSplitted.length == 1) {
            return memePathSplitted[0] in memeDict;
        }
        return false;
    }

    private checkMemeIsDir(memeDict: any, memePath: string): boolean {
        const memePathSplitted = memePath.split(" ", 2).filter(Boolean);
        if (memePathSplitted.length == 2) {
            if (memeDict[memePathSplitted[0]] != null) {
                return this.checkMemeValid(memeDict[memePathSplitted[0]], memePathSplitted[1]);
            }
        }
        else if (memePathSplitted.length == 1) {
            return !memeDict[memePathSplitted[0]] || typeof memeDict[memePathSplitted[0]] !== "string";
        }
        return false;
    }

    private buildMemePath(memePath: string): string {
        let result = this.attachmentsDir;
        let dict = this.memes;
        const memePathSplitted = memePath.split(" ").filter(Boolean);
        for (let memePathSeg of memePathSplitted) {
            if (typeof dict[memePathSeg] === "string") {
                return path.join(result, dict[memePathSeg]);
            }
            dict = dict[memePathSeg];
            result = path.join(result, memePathSeg);
        }
        return result;
    }

    private buildMemeList(memeDict: any, nest: number): string {
        let result = "";
        for (let key in memeDict) {
            result += "\t".repeat(nest);
            result += key;
            if (typeof memeDict[key] === "string") {
                result += " = " + memeDict[key];
            }
            result += "\n";
            if (memeDict[key] != null && typeof memeDict[key] !== "string") {
                result += this.buildMemeList(memeDict[key], nest + 1);
            }
        }
        return result;
    }


    static readonly CONFIG_AZURE_CONTAINER_NAME = "azure.meme_container";
    static readonly CONFIG_AZURE_LIST_FILE_NAME = "azure.meme_list";
}