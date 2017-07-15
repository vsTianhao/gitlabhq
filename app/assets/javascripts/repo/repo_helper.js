import Service from './repo_service';
import Store from './repo_store';
import Flash from '../flash';

const RepoHelper = {
  isTree(data) {
    return Object.hasOwnProperty.call(data, 'blobs');
  },

  monacoInstance: undefined,

  Time: window.performance
  && window.performance.now
  ? window.performance
  : Date,

  getLanguagesForMimeType(mimetypeNeedle) {
    const langs = window.monaco.languages.getLanguages();
    langs.map((lang) => {
      const hasLang = lang.mimetypes.some(mimetype => mimetypeNeedle === mimetype);
      if (hasLang) return lang.id;
      return lang;
    });
  },

  blobURLtoParent(url) {
    let joined = '';
    const split = url.split('/');
    split.pop();
    const blobIndex = split.indexOf('blob');
    if (blobIndex > -1) {
      split[blobIndex] = 'tree';
    }
    joined = split.join('/');
    return split.join('/');
  },

  insertNewFilesIntoParentDir(inDirectory, oldList, newList) {
    let indexOfFile;
    if (!inDirectory) {
      return newList;
    }
    oldList.find((file, i) => {
      if (file.url === inDirectory.url) {
        indexOfFile = i + 1;
        return true;
      }
      return false;
    });
    if (indexOfFile) {
      // insert new list into old list
      newList.forEach((newFile) => {
        const file = newFile;
        file.level = inDirectory.level + 1;
        oldList.splice(indexOfFile, 0, file);
      });
      return oldList;
    }
    return newList;
  },

  resetBinaryTypes() {
    let s = '';
    for (s in Store.binaryTypes) {
      Store.binaryTypes[s] = false;
    }
  },

  setActiveFile(file) {
    Store.openedFiles = Store.openedFiles.map((openedFile) => {
      const activeFile = openedFile;
      activeFile.active = file.url === activeFile.url; // eslint-disable-line no-param-reassign
      if (activeFile.active) {
        Store.activeFile = activeFile;
      }
      return activeFile;
    });
    if (file.binary) {
      Store.blobRaw = file.base64;
    } else {
      Store.blobRaw = file.plain;
    }
    if (!file.loading) {
      this.toURL(file.url);
    }
    Store.binary = file.binary;
  },

  removeFromOpenedFiles(file) {
    if (file.type === 'tree') return;
    Store.openedFiles = Store.openedFiles.filter(openedFile => openedFile.url !== file.url);
  },

  addToOpenedFiles(file) {
    const openedFilesAlreadyExists = Store.openedFiles
      .some(openedFile => openedFile.url === file.url);
    if (!openedFilesAlreadyExists) {
      Store.openedFiles.push(file);
    }
  },

  /* eslint-disable no-param-reassign */
  setDirectoryOpen(tree) {
    if (tree) {
      tree.opened = true;
      tree.icon = 'fa-folder-open';
    }
  },
  /* eslint-enable no-param-reassign */

  getRawURLFromBlobURL(url) {
    return url.replace('blob', 'raw');
  },

  getBlameURLFromBlobURL(url) {
    return url.replace('blob', 'blame');
  },

  getHistoryURLFromBlobURL(url) {
    return url.replace('blob', 'commits');
  },

  setBinaryDataAsBase64(url, file) {
    Service.getBase64Content(url)
    .then((response) => {
      Store.blobRaw = response;
      file.base64 = response; // eslint-disable-line no-param-reassign
    })
    .catch(this.loadingError);
  },

  toggleFakeTab(loading, file) {
    if (loading) {
      const randomURL = this.Time.now();
      const newFakeFile = {
        active: false,
        binary: true,
        type: 'blob',
        loading: true,
        mime_type: 'loading',
        name: 'loading',
        url: randomURL,
      };
      Store.openedFiles.push(newFakeFile);
      return newFakeFile;
    }
    this.removeFromOpenedFiles(file);
    return null;
  },

  setLoading(loading, file) {
    if (Service.url.indexOf('tree') > -1) {
      Store.loading.tree = loading;
    } else if (Service.url.indexOf('blob') > -1) {
      Store.loading.blob = loading;
      return this.toggleFakeTab(loading, file);
    }

    return undefined;
  },

    // may be tree or file.
  getContent(file) {
    const loadingData = this.setLoading(true);
    Service.getContent()
    .then((response) => {
      const data = response.data;
      this.setLoading(false, loadingData);
      Store.isTree = this.isTree(data);
      if (!Store.isTree) {
        if (!file) {
          file = data;
        }
        // it's a blob
        Store.binary = data.binary;
        if (data.binary) {
          Store.binaryMimeType = data.mime_type;
          this.setBinaryDataAsBase64(
            this.getRawURLFromBlobURL(file.url),
            data,
          );
          data.binary = true;
          if (!file.url) {
            file.url = location.pathname;
          }
          data.url = file.url;
          this.addToOpenedFiles(data);
          this.setActiveFile(data);
        } else {
          Store.blobRaw = data.plain;
          if (!file.url) {
            file.url = location.pathname;
          }
          data.url = file.url;
          data.binary = false;
          this.addToOpenedFiles(data);
          this.setActiveFile(data);
        }

        // if the file tree is empty
        if (Store.files.length === 0) {
          const parentURL = this.blobURLtoParent(Service.url);
          Service.url = parentURL;
          this.getContent();
        }
      } else {
        // it's a tree
        this.setDirectoryOpen(file);
        const newDirectory = this.dataToListOfFiles(data);
        Store.files = this.insertNewFilesIntoParentDir(file, Store.files, newDirectory);
        Store.prevURL = this.blobURLtoParent(Service.url);
      }
    })
    .catch(() => {
      this.setLoading(false, loadingData);
      this.loadingError();
    });
  },

  toFA(icon) {
    return `fa-${icon}`;
  },

  /* eslint-disable no-param-reassign */
  removeChildFilesOfTree(tree) {
    let foundTree = false;
    Store.files = Store.files.filter((file) => {
      if (file.url === tree.url) {
        foundTree = true;
      }
      if (foundTree) {
        return file.level <= tree.level;
      }
      return true;
    });

    tree.opened = false;
    tree.icon = 'fa-folder';
  },
  /* eslint-enable no-param-reassign */

  blobToSimpleBlob(blob) {
    return {
      type: 'blob',
      name: blob.name,
      url: blob.url,
      icon: this.toFA(blob.icon),
      lastCommitMessage: blob.last_commit.message,
      lastCommitUpdate: blob.last_commit.committed_date,
      level: 0,
    };
  },

  treeToSimpleTree(tree) {
    return {
      type: 'tree',
      name: tree.name,
      url: tree.url,
      icon: this.toFA(tree.icon),
      level: 0,
    };
  },

  dataToListOfFiles(data) {
    const a = [];

    // push in blobs
    data.blobs.forEach((blob) => {
      a.push(this.blobToSimpleBlob(blob));
    });

    data.trees.forEach((tree) => {
      a.push(this.treeToSimpleTree(tree));
    });

    data.submodules.forEach((submodule) => {
      a.push({
        type: 'submodule',
        name: submodule.name,
        url: submodule.url,
        icon: this.toFA(submodule.icon),
        level: 0,
      });
    });

    return a;
  },

  genKey() {
    return this.Time.now().toFixed(3);
  },

  key: '',

  getStateKey() {
    return this.key;
  },

  setStateKey(key) {
    this.key = key;
  },

  toURL(url) {
    const history = window.history;
    this.key = this.genKey();
    history.pushState({ key: this.key }, '', url);
  },

  loadingError() {
    new Flash('Unable to load the file at this time.'); // eslint-disable-line no-new
  },
};

export default RepoHelper;
