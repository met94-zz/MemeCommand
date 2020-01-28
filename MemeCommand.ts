import { AbstractCommandModule, Message, OutgoingMessage } from "botyo-api";
import fs = require('fs');
import path = require('path');

export default class MemeCommand extends AbstractCommandModule {
   memes: any;

   constructor() {
      super();
      const config = this.getRuntime().getConfiguration();
      this.memes = config.getProperty("memes");
   }

   get basedir(): string {
      return process.cwd();
   }

   get attachmentsDir(): string {
      return path.join(this.basedir, "attachments");
   }

   getCommand(): string {
      return "piss";
   }

   getDescription(): string {
      return "Responds to the hello";
   }

   getUsage(): string {
      return "";
   }

   validate(msg: Message, args: string): boolean {
      if (!args) {
         return false;
      }

      if (!this.checkMemeValid(this.memes, args)) {
         return false;
      }

      let path: string = this.buildMemePath(args);

      if (!fs.existsSync(path)) {
         return false;
      }
      if (fs.lstatSync(path).isDirectory()) {
         return fs.readdirSync(path).length > 0;
      }

      return true;
   }

   async execute(msg: Message, args: string): Promise<any> {
      let attachmentPath: string = this.buildMemePath(args);

      if (fs.lstatSync(attachmentPath).isDirectory()) {
         let files: string[] = fs.readdirSync(attachmentPath);
         attachmentPath = path.join(attachmentPath, files[Math.floor(Math.random() * files.length)]);
      }

      var message: OutgoingMessage = {
         attachment: fs.createReadStream(attachmentPath)
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

   private buildMemePath(memePath: string): string {
      let result = this.attachmentsDir;
      let dict = this.memes;
      const memePathSplitted = memePath.split(" ").filter(Boolean);
      for (let memePathSeg of memePathSplitted) {
         if (typeof dict[memePathSeg] === "string") {
            return path.join(dict[memePathSeg]);
         }
         dict = dict[memePathSeg];
         result = path.join(result, memePathSeg);
      }
      return result;
   }
}